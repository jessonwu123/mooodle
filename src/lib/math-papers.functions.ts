import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ExtractInput = z
  .object({
    paperPageImages: z.array(z.string()).min(1).max(30),
    answerPageImages: z.array(z.string()).max(10).default([]),
    questionStart: z.number().int().min(1).max(25).default(1),
    questionEnd: z.number().int().min(1).max(25).default(25),
  })
  .refine((d) => d.questionStart <= d.questionEnd, {
    message: "题号范围无效",
    path: ["questionEnd"],
  });

export const extractPaperQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("仅管理员可执行");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const paperCount = data.paperPageImages.length;
    const rangeText =
      data.questionStart === 1 && data.questionEnd === 25
        ? "全部 25 道题目"
        : `第 ${data.questionStart}-${data.questionEnd} 题（只返回这个题号范围）`;
    const prompt = `这是一份 AMC 8 数学竞赛试卷，共 25 道选择题，每题有 A-E 五个选项。

我会按顺序给你两类图片：
- 前 ${paperCount} 张：试卷页面（页面索引从 0 到 ${paperCount - 1}）
- 之后的图片：答案对照页（如果有）

请从试卷中提取出${rangeText}，按题号升序排序。不要返回范围外题目。对每道题输出：
- number: 题号 1-25
- stem: 题干文本（保留原语言；数学公式用 $...$ 包裹，例如 $x^2 + 1$）
- option_a/option_b/option_c/option_d/option_e: 五个选项文本（保留 $...$）
- correct_answer: 正确答案字母（A/B/C/D/E），从答案页查得；如无答案页则为 null
- has_figure: 该题是否包含必须显示的图形、几何图、坐标图、示意图（true/false）；纯文字题为 false
- page_index: 该题题干所在的试卷页索引（0 到 ${paperCount - 1}）
- bbox: 当 has_figure=true 时，给出该图形在 page_index 那张图中的归一化矩形 { x, y, w, h }（0-1 范围，左上角原点）；尽量只圈住图形本身，不要包含题号和大段文字；has_figure=false 时为 null

严格只返回如下 JSON：
{ "questions": [ { "number": 1, "stem": "...", "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...", "option_e": "...", "correct_answer": "B", "has_figure": false, "page_index": 0, "bbox": null }, ... ] }`;

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...data.paperPageImages.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
          ...data.answerPageImages.map((url) => ({
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
        max_tokens: 6000,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度不足，请到工作区设置补充额度");
      throw new Error(`AI 抽取失败 ${resp.status}: ${text.slice(0, 200)}`);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回为空");
    const contentText = String(content)
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(contentText);
    return parsed as {
      questions: Array<{
        number: number;
        stem: string;
        option_a: string | null;
        option_b: string | null;
        option_c: string | null;
        option_d: string | null;
        option_e: string | null;
        correct_answer: string | null;
        has_figure: boolean;
        page_index: number;
        bbox: { x: number; y: number; w: number; h: number } | null;
      }>;
    };
  });

const SaveInput = z.object({
  year: z.number().int().min(1900).max(2100),
  name: z.string().min(1).max(200),
  pdfPath: z.string().min(1),
  answerPdfPath: z.string().nullable(),
  questions: z
    .array(
      z.object({
        number: z.number().int().min(1).max(100),
        stem: z.string(),
        option_a: z.string().nullable(),
        option_b: z.string().nullable(),
        option_c: z.string().nullable(),
        option_d: z.string().nullable(),
        option_e: z.string().nullable(),
        correct_answer: z.string().nullable(),
        image_path: z.string().nullable(),
      }),
    )
    .min(1)
    .max(100),
});

export const saveMathPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("仅管理员可执行");

    const { supabase } = context;
    const { data: paper, error } = await supabase
      .from("math_papers")
      .insert({
        year: data.year,
        name: data.name,
        pdf_path: data.pdfPath,
        answer_pdf_path: data.answerPdfPath,
        question_count: data.questions.length,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !paper) throw new Error(error?.message || "试卷写入失败");

    const rows = data.questions.map((q) => ({
      paper_id: paper.id,
      year: data.year,
      question_number: q.number,
      stem: q.stem,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      correct_answer: q.correct_answer,
      image_path: q.image_path,
    }));
    const { error: e2 } = await supabase.from("math_questions").insert(rows);
    if (e2) {
      await supabase.from("math_papers").delete().eq("id", paper.id);
      throw new Error("题目写入失败：" + e2.message);
    }
    return { paperId: paper.id as string };
  });

export const deleteMathPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paperId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("仅管理员可执行");
    const { error } = await context.supabase.from("math_papers").delete().eq("id", data.paperId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
