import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("仅管理员可执行");
}

const ExtractInput = z.object({
  paperId: z.string().uuid(),
  solutionPageImages: z.array(z.string().url()).min(1).max(40),
});

export const extractSolutionsForPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { data: questions, error: qErr } = await context.supabase
      .from("math_questions")
      .select("id, question_number")
      .eq("paper_id", data.paperId)
      .order("question_number");
    if (qErr) throw new Error(qErr.message);
    if (!questions || questions.length === 0) throw new Error("该试卷暂无题目");

    const numbers = questions.map((q: any) => q.question_number);
    const prompt = `这是一份 AMC 8 数学竞赛的**详细解析**（解答）文档，按题号依次给出每道题的完整解题过程。请按题号提取每道题的解析，并**同时给出英文原文和中文翻译两个版本**。

【目标题号】${numbers.join(", ")}

【页码约定】
我已经按顺序把解析 PDF 的每一页转成了图片（page 1 是第一张图），坐标原点在每页左上角，x、y、w、h 都使用相对该页的 0~1 归一化值。

【关于解析中的配图】
解析中可能包含**对解题至关重要的几何图、示意图、坐标图、表格**等无法用 LaTeX 表达的图形。**不要尝试用文字或 LaTeX 描述这些图形**，而是把它截图：
- 给每个图分配一个 id（如 "f1"、"f2"，全卷唯一即可），并在 figures 数组中说明它所在的 page（1 起）和归一化 bbox { x, y, w, h }
- 在 solution_md / solution_md_zh 中需要展示该图的位置，插入占位符 [[FIG:f1]]（独占一行）
- 仅截取**图形本身**，不要把题号、题干文字、答案文字框进去
- 若一道题没有配图，figures 可以为空数组

【输出格式】对每道**有解析**的题目输出一个对象（没有解析的题直接跳过）：
- number: 题号（整数）
- solution_md: **英文原文**的完整解析正文。**必须使用 Markdown + LaTeX**：
  * 行内数学用 $...$，独立公式用 $$...$$
  * 字面美元符号一律写成 \\$（如 "He paid \\$5"）
  * 解答里多步推导可使用 Markdown 列表、加粗、分段
  * 保留答案行（例如 "The answer is (C)"）
  * 不要把题干本身重复抄一遍，只要解题过程和最终答案
  * 不要包含原文中的页眉、页脚、页码、版权声明
  * 配图位置插入 [[FIG:xxx]] 独占一行
- solution_md_zh: **中文翻译**版本，同样的格式要求（Markdown + LaTeX + 美元符号转义 + [[FIG:xxx]] 占位）。翻译要准确、自然，保留所有数学符号、变量名不变；解题步骤逐条翻译；答案行翻译为"答案：(C)"风格
- figures: 该题用到的配图列表，元素为 { id: string, page: number, bbox: { x: number, y: number, w: number, h: number } }；没有图则为 []

严格只返回 JSON：
{ "solutions": [ { "number": 1, "solution_md": "...", "solution_md_zh": "...", "figures": [ { "id":"f1", "page":2, "bbox":{"x":0.1,"y":0.32,"w":0.4,"h":0.18} } ] }, ... ] }`;

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...data.solutionPageImages.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 48000,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度不足，请到工作区设置补充额度");
      throw new Error(`AI 抽取失败 ${resp.status}: ${t.slice(0, 200)}`);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回为空");
    let text = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) text = text.slice(first, last + 1);
    const fixed = text.replace(/\\([\s\S])/g, (m, ch: string) => {
      if ('"\\/bfnrt'.includes(ch)) return m;
      if (ch === "u") return m;
      return "\\\\" + ch;
    });
    let parsed: any;
    try {
      parsed = JSON.parse(fixed);
    } catch (e) {
      throw new Error("AI 返回 JSON 无法解析：" + (e as Error).message.slice(0, 120));
    }

    type Figure = { id: string; page: number; bbox: { x: number; y: number; w: number; h: number } };
    type Sol = {
      number: number;
      solution_md: string;
      solution_md_zh: string;
      figures: Figure[];
    };
    const solutions: Sol[] = (parsed?.solutions ?? [])
      .map((s: any) => ({
        number: Number(s?.number),
        solution_md: typeof s?.solution_md === "string" ? s.solution_md.trim() : "",
        solution_md_zh: typeof s?.solution_md_zh === "string" ? s.solution_md_zh.trim() : "",
        figures: Array.isArray(s?.figures)
          ? (s.figures
              .map((f: any) => {
                const bb = f?.bbox ?? {};
                const x = Number(bb.x), y = Number(bb.y), w = Number(bb.w), h = Number(bb.h);
                const page = Number(f?.page);
                const id = String(f?.id ?? "").trim();
                if (!id || !Number.isFinite(page) || page < 1) return null;
                if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
                return { id, page, bbox: { x, y, w, h } };
              })
              .filter(Boolean) as Figure[])
          : [],
      }))
      .filter((s: Sol) => Number.isInteger(s.number) && s.solution_md);

    // Write solutions text (figures handled separately on client)
    const byNumber = new Map<number, Sol>();
    solutions.forEach((s) => byNumber.set(s.number, s));
    let updated = 0;
    const figureJobs: Array<{
      questionId: string;
      questionNumber: number;
      figures: Figure[];
    }> = [];
    for (const q of questions as Array<{ id: string; question_number: number }>) {
      const sol = byNumber.get(q.question_number);
      if (!sol) continue;
      const { error } = await context.supabase
        .from("math_questions")
        .update({
          solution_md: sol.solution_md,
          solution_md_zh: sol.solution_md_zh || null,
          solution_images: [],
        })
        .eq("id", q.id);
      if (error) throw new Error(`第 ${q.question_number} 题写入失败：${error.message}`);
      updated++;
      if (sol.figures.length > 0) {
        figureJobs.push({ questionId: q.id, questionNumber: q.question_number, figures: sol.figures });
      }
    }
    return { ok: true, totalQuestions: questions.length, updated, figureJobs };
  });

const SaveImagesInput = z.object({
  questionId: z.string().uuid(),
  images: z.array(z.object({ marker: z.string().min(1), path: z.string().min(1) })),
});
export const saveSolutionImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveImagesInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_questions")
      .update({ solution_images: data.images })
      .eq("id", data.questionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ClearInput = z.object({ paperId: z.string().uuid() });
export const clearSolutionsForPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_questions")
      .update({ solution_md: null, solution_md_zh: null, solution_images: [] })
      .eq("paper_id", data.paperId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
