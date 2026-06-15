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

type Bbox = { x: number; y: number; w: number; h: number } | null;

function bboxFromGemini(raw: unknown): Bbox {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map((n) => Number(n));
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const [ymin, xmin, ymax, xmax] = nums;
  const maxVal = Math.max(ymin, xmin, ymax, xmax);
  const scale = maxVal > 100 ? 1000 : maxVal > 1 ? 100 : 1;
  const x = Math.max(0, Math.min(1, xmin / scale));
  const y = Math.max(0, Math.min(1, ymin / scale));
  const w = Math.max(0, Math.min(1 - x, (xmax - xmin) / scale));
  const h = Math.max(0, Math.min(1 - y, (ymax - ymin) / scale));
  if (w <= 0.005 || h <= 0.005) return null;
  return { x, y, w, h };
}

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

请从试卷中提取出${rangeText}，按题号升序排序。不要返回范围外题目。

对每道题输出：
- number: 题号 1-25
- stem: 题干文本（保留原语言；数学公式用 $...$ 包裹，例如 $x^2 + 1$）
- option_a/option_b/option_c/option_d/option_e: 五个选项文本（保留 $...$）
- correct_answer: 正确答案字母（A/B/C/D/E），从答案页查得；如无答案页则为 null
- page_index: 该题所在的试卷页索引（0 到 ${paperCount - 1}）。如果题目跨页，请按选项 (A)-(E) 所在的页来填。
- stem_bbox_2d: 题干区域的边界框（包含题号、题干文字以及题目附带的图形/几何图/示意图，如果有图，把图和文字一起圈进来；不要包含 A-E 选项）。格式为 [ymin, xmin, ymax, xmax]，0-1000 范围整数，左上角原点，相对 page_index 那张页面图片。
- options_bbox_2d: 包含 A-E 全部 5 个选项的整块区域的边界框，格式同上。

务必保证 stem_bbox_2d 与 options_bbox_2d 互不重叠，且都尽量紧凑只圈住对应内容。

严格只返回如下 JSON：
{ "questions": [ { "number": 1, "stem": "...", "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...", "option_e": "...", "correct_answer": "B", "page_index": 0, "stem_bbox_2d": [..], "options_bbox_2d": [..] }, ... ] }`;

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
        max_tokens: 16000,
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
    const parsed = JSON.parse(contentText) as {
      questions: Array<{
        number: number;
        stem: string;
        option_a: string | null;
        option_b: string | null;
        option_c: string | null;
        option_d: string | null;
        option_e: string | null;
        correct_answer: string | null;
        page_index: number;
        stem_bbox_2d?: [number, number, number, number] | null;
        options_bbox_2d?: [number, number, number, number] | null;
      }>;
    };
    const questions = (parsed.questions ?? []).map((q) => ({
      ...q,
      stem_bbox: bboxFromGemini(q.stem_bbox_2d),
      options_bbox: bboxFromGemini(q.options_bbox_2d),
    }));
    return { questions } as {
      questions: Array<{
        number: number;
        stem: string;
        option_a: string | null;
        option_b: string | null;
        option_c: string | null;
        option_d: string | null;
        option_e: string | null;
        correct_answer: string | null;
        page_index: number;
        stem_bbox: Bbox;
        options_bbox: Bbox;
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
        options_image_path: z.string().nullable(),
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
      options_image_path: q.options_image_path,
    }));
    const { error: e2 } = await supabase.from("math_questions").insert(rows);
    if (e2) {
      await supabase.from("math_papers").delete().eq("id", paper.id);
      throw new Error("题目写入失败：" + e2.message);
    }
    return { paperId: paper.id as string };
  });

// 仅创建试卷记录（PDF 已上传到 storage），不抽题
export const createMathPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        year: z.number().int().min(1900).max(2100),
        name: z.string().min(1).max(200),
        pdfPath: z.string().min(1),
        answerPdfPath: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("仅管理员可执行");
    const { data: paper, error } = await context.supabase
      .from("math_papers")
      .insert({
        year: data.year,
        name: data.name,
        pdf_path: data.pdfPath,
        answer_pdf_path: data.answerPdfPath,
        question_count: 0,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !paper) throw new Error(error?.message || "试卷写入失败");
    return { paperId: paper.id as string };
  });

// 把抽取出的题目入库到一个已存在的试卷（覆盖：先清空旧题再写入）
const ReplaceInput = z.object({
  paperId: z.string().uuid(),
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
        options_image_path: z.string().nullable(),
      }),
    )
    .min(1)
    .max(100),
});
export const replaceMathPaperQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReplaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("仅管理员可执行");
    const { supabase } = context;
    const { data: paper, error: e0 } = await supabase
      .from("math_papers")
      .select("id, year")
      .eq("id", data.paperId)
      .single();
    if (e0 || !paper) throw new Error("试卷不存在");

    const { error: eDel } = await supabase
      .from("math_questions")
      .delete()
      .eq("paper_id", data.paperId);
    if (eDel) throw new Error("清理旧题目失败：" + eDel.message);

    const rows = data.questions.map((q) => ({
      paper_id: data.paperId,
      year: paper.year,
      question_number: q.number,
      stem: q.stem,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      correct_answer: q.correct_answer,
      image_path: q.image_path,
      options_image_path: q.options_image_path,
    }));
    const { error: e2 } = await supabase.from("math_questions").insert(rows);
    if (e2) throw new Error("题目写入失败：" + e2.message);

    const { error: e3 } = await supabase
      .from("math_papers")
      .update({ question_count: rows.length })
      .eq("id", data.paperId);
    if (e3) throw new Error("更新试卷信息失败：" + e3.message);

    return { ok: true, count: rows.length };
  });

// 获取试卷及答案 PDF 的临时下载链接
export const getMathPaperPdfUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paperId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: paper, error } = await context.supabase
      .from("math_papers")
      .select("id, name, pdf_path, answer_pdf_path")
      .eq("id", data.paperId)
      .single();
    if (error || !paper) throw new Error("试卷不存在");
    const paths = [paper.pdf_path, paper.answer_pdf_path].filter(Boolean) as string[];
    const { data: signed, error: e2 } = await context.supabase.storage
      .from("math-papers")
      .createSignedUrls(paths, 60 * 30);
    if (e2) throw new Error("生成下载链接失败：" + e2.message);
    const map = new Map<string, string>();
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
    });
    return {
      name: paper.name as string,
      pdfUrl: paper.pdf_path ? (map.get(paper.pdf_path) ?? null) : null,
      answerPdfUrl: paper.answer_pdf_path ? (map.get(paper.answer_pdf_path) ?? null) : null,
    };
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
