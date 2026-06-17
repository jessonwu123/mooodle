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
    const prompt = `这是一份 AMC 8 数学竞赛的**详细解析**（解答）文档，按题号依次给出每道题的完整解题过程。请按题号提取每道题的解析正文。

【目标题号】${numbers.join(", ")}

【输出格式】
对每道有解析的题目输出一个对象：
- number: 题号（整数）
- solution_md: 该题的完整解析正文。**必须使用 Markdown + LaTeX**：
  * 行内数学用 $...$，独立公式用 $$...$$
  * 字面美元符号一律写成 \\$（如 "He paid \\$5"）
  * 解答里多步推导可使用 Markdown 列表、加粗、分段
  * 保留答案行（例如 "答案：(B)" 或 "The answer is (C)"）
  * 若解析中包含纯几何图/示意图无法用 LaTeX 表达，用 $\\text{[几何示意图]}$ 占位
  * 不要把题干本身重复抄一遍，只要解题过程和最终答案
  * 不要包含原文中的页眉、页脚、页码、版权声明
- 若某题号在该文档里没有解析，不要为它输出对象（即跳过）

严格只返回 JSON：
{ "solutions": [ { "number": 1, "solution_md": "..." }, ... ] }`;

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
        max_tokens: 32000,
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
    // tolerate stray LaTeX backslashes (\sqrt etc.) that aren't valid JSON escapes
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
    const solutions: Array<{ number: number; solution_md: string }> = (parsed?.solutions ?? [])
      .map((s: any) => ({
        number: Number(s?.number),
        solution_md: typeof s?.solution_md === "string" ? s.solution_md.trim() : "",
      }))
      .filter((s: any) => Number.isInteger(s.number) && s.solution_md);

    // Write back
    const byNumber = new Map<number, string>();
    solutions.forEach((s) => byNumber.set(s.number, s.solution_md));
    let updated = 0;
    for (const q of questions as Array<{ id: string; question_number: number }>) {
      const md = byNumber.get(q.question_number);
      if (!md) continue;
      const { error } = await context.supabase
        .from("math_questions")
        .update({ solution_md: md })
        .eq("id", q.id);
      if (error) throw new Error(`第 ${q.question_number} 题写入失败：${error.message}`);
      updated++;
    }
    return { ok: true, totalQuestions: questions.length, updated };
  });

const ClearInput = z.object({ paperId: z.string().uuid() });
export const clearSolutionsForPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_questions")
      .update({ solution_md: null })
      .eq("paper_id", data.paperId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
