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
- stem_page_index: 题干（含题号和附带图形）所在的试卷页索引（0 到 ${paperCount - 1}）。
- options_page_index: A-E 五个选项所在的试卷页索引（0 到 ${paperCount - 1}）。**如果题目跨页**（题干在某一页底部，选项在下一页顶部），stem_page_index 和 options_page_index 必须分别填写正确的页号。
- page_index: 与 options_page_index 相同，保留作兼容字段。
- stem_bbox_2d: 题干区域的边界框，**坐标必须相对 stem_page_index 那一页**。**必须把题号、题干文字以及题目附带的全部图形/几何图/示意图/表格完整圈进来**（图形可能在文字上方、下方或与文字穿插，都要包含；宁可框得宽松一点也不要切掉图形的任何一边，包括图形上方/下方的留白、坐标轴标签、刻度文字、单位说明）。**绝对不要把以 (A)、(B) 等开头的选项行包含进 stem_bbox**——题干的下边界必须严格停在选项行的上方。格式 [ymin, xmin, ymax, xmax]，0-1000 范围整数，左上角原点。
- options_bbox_2d: 包含 A-E 全部 5 个选项的整块区域的边界框，**坐标相对 options_page_index 那一页**。如果选项里有图形，必须把图形完整包进来。格式同上。
- stem_render_mode: "text" 或 "image"。判定规则：
    * 题干**仅由文字、数字、可用 LaTeX 表示的公式**组成 → "text"
    * 题干含有**无法用文字或 LaTeX 表达的图形**（如几何图、函数图像、示意图、表格、象形符号嵌在句中、图片穿插在文字之间）→ "image"
- options_render_mode: "text" 或 "image"，判定规则同上（选项含图形/图片就用 "image"，纯文本/纯公式就用 "text"）。

务必保证 stem_bbox_2d 与 options_bbox_2d 互不重叠，且都尽量紧凑只圈住对应内容。
**stem 与各 option 字段必须始终使用 LaTeX 格式**：行内数学用 $...$，独立公式用 $$...$$，文字（包括英文/中文叙述）保持原样不要包进数学环境。
**货币美元符号必须写成 \\$**（例如 "He paid \\$5" 而不是 "He paid $5"），否则会被误识别为数学分隔符。其它需要在正文中显示的字面 $ 同样要写成 \\$。
即使 stem_render_mode 或 options_render_mode 为 "image"，stem 与各 option 字段仍**必须给出 LaTeX 文字备份**（用于搜索和打 tag）。无法用 LaTeX 表达的图形/几何示意图/表格，请用 LaTeX 文本占位代替，例如 $\\text{[几何示意图]}$、$\\text{[函数图像]}$、$\\text{[表格]}$，而不是裸的方括号文字。务必保证所有数学符号（分数、根号、上下标、希腊字母、向量、矩阵等）都使用规范的 LaTeX 命令。

严格只返回如下 JSON：
{ "questions": [ { "number": 1, "stem": "...", "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...", "option_e": "...", "correct_answer": "B", "page_index": 0, "stem_page_index": 0, "options_page_index": 0, "stem_bbox_2d": [..], "options_bbox_2d": [..], "stem_render_mode": "text", "options_render_mode": "text" }, ... ] }`;

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
        max_tokens: 32000,
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
    const finishReason = json.choices?.[0]?.finish_reason;
    if (!content) throw new Error("AI 返回为空");
    let contentText = String(content)
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    // Clip to first { ... last } so any stray prose around the JSON is dropped.
    const firstBrace = contentText.indexOf("{");
    const lastBrace = contentText.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      contentText = contentText.slice(firstBrace, lastBrace + 1);
    }

    // Fix invalid JSON escapes (\sqrt, \pi, ...) WITHOUT double-escaping
    // already-valid pairs like \\, \", \n. We consume `\X` greedily so a
    // valid `\\` is matched as one unit and the following char is left alone.
    const fixLatexEscapes = (s: string) =>
      s
        .replace(/\\([\s\S])/g, (m, ch: string) => {
          if ('"\\/bfnrt'.includes(ch)) return m;
          if (ch === "u") return m; // unicode escape handled below
          return "\\\\" + ch;
        })
        // \u not followed by 4 hex digits is invalid
        .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u")
        // strip stray control chars (other than already-handled whitespace)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");

    const tryParse = (s: string) => {
      try { return JSON.parse(s); } catch (e) { return { __err: (e as Error).message, __at: parseErrPos((e as Error).message) }; }
    };
    function parseErrPos(msg: string): number | null {
      const m = msg.match(/position\s+(\d+)/);
      return m ? Number(m[1]) : null;
    }
    const isOk = (v: any) => v && !v.__err;

    let attempt = tryParse(contentText);
    if (!isOk(attempt)) {
      const fixed = fixLatexEscapes(contentText);
      const a2 = tryParse(fixed);
      if (isOk(a2)) {
        attempt = a2;
        contentText = fixed;
      } else {
        // Truncation repair: keep only complete question objects inside "questions": [ ... ]
        contentText = fixed;
        const arrStart = contentText.indexOf('"questions"');
        if (arrStart >= 0) {
          const bracketStart = contentText.indexOf("[", arrStart);
          if (bracketStart >= 0) {
            let depth = 0; // tracks {} only
            let lastGood = -1;
            let inStr = false;
            let esc = false;
            for (let i = bracketStart + 1; i < contentText.length; i++) {
              const c = contentText[i];
              if (inStr) {
                if (esc) esc = false;
                else if (c === "\\") esc = true;
                else if (c === '"') inStr = false;
                continue;
              }
              if (c === '"') inStr = true;
              else if (c === "{") depth++;
              else if (c === "}") {
                depth--;
                if (depth === 0) lastGood = i; // closed a question object
              }
            }
            if (lastGood > 0) {
              const repaired = contentText.slice(0, lastGood + 1) + "]}";
              const a3 = tryParse(repaired);
              if (isOk(a3)) {
                attempt = a3;
                contentText = repaired;
              }
            }
          }
        }
      }
    }

    if (!isOk(attempt)) {
      const errMsg = attempt?.__err ?? "unknown";
      const pos = attempt?.__at;
      const snippet =
        typeof pos === "number"
          ? contentText.slice(Math.max(0, pos - 80), pos + 80)
          : contentText.slice(0, 200);
      console.error("[extractPaperQuestions] JSON parse failed", {
        finishReason,
        errMsg,
        pos,
        snippet,
        totalLen: contentText.length,
      });
      const hint = finishReason === "length" ? "（AI 输出超长被截断，请缩小题号范围分批抽取）" : "";
      throw new Error(`AI 返回的 JSON 无法解析${hint}：${errMsg.slice(0, 120)}`);
    }
    const parsed = attempt as {
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
        stem_page_index?: number | null;
        options_page_index?: number | null;
        stem_bbox_2d?: [number, number, number, number] | null;
        options_bbox_2d?: [number, number, number, number] | null;
        stem_render_mode?: string | null;
        options_render_mode?: string | null;
      }>;
    };
    const normMode = (m: unknown): "text" | "image" =>
      typeof m === "string" && m.toLowerCase() === "image" ? "image" : "text";
    const toPageIdx = (v: unknown, fallback: number): number => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n < paperCount ? n : fallback;
    };
    const questions = (parsed.questions ?? []).map((q) => {
      const basePage = toPageIdx(q.page_index, 0);
      return {
        ...q,
        page_index: basePage,
        stem_page_index: toPageIdx(q.stem_page_index, basePage),
        options_page_index: toPageIdx(q.options_page_index, basePage),
        stem_bbox: bboxFromGemini(q.stem_bbox_2d),
        options_bbox: bboxFromGemini(q.options_bbox_2d),
        stem_render_mode: normMode(q.stem_render_mode),
        options_render_mode: normMode(q.options_render_mode),
      };
    });
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
        stem_page_index: number;
        options_page_index: number;
        stem_bbox: Bbox;
        options_bbox: Bbox;
        stem_render_mode: "text" | "image";
        options_render_mode: "text" | "image";
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
        stem_render_mode: z.enum(["text", "image"]).optional(),
        options_render_mode: z.enum(["text", "image"]).optional(),
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
      stem_render_mode: q.stem_render_mode ?? "text",
      options_render_mode: q.options_render_mode ?? "text",
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
        year: z.number().int().min(1900).max(2100).nullable().optional(),
        name: z.string().min(1).max(200),
        pdfPath: z.string().min(1),
        answerPdfPath: z.string().nullable().optional(),
        folderId: z.string().uuid().nullable().optional(),
        kind: z.enum(["paper", "answer"]).optional(),
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
        year: data.year ?? null,
        name: data.name,
        pdf_path: data.pdfPath,
        answer_pdf_path: data.answerPdfPath ?? null,
        folder_id: data.folderId ?? null,
        kind: data.kind ?? "paper",
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
        stem_render_mode: z.enum(["text", "image"]).optional(),
        options_render_mode: z.enum(["text", "image"]).optional(),
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
      stem_render_mode: q.stem_render_mode ?? "text",
      options_render_mode: q.options_render_mode ?? "text",
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

// 批量更新某试卷题目的正确答案（按题号匹配）
const BulkAnswersInput = z.object({
  paperId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        number: z.number().int().min(1).max(100),
        answer: z.enum(["A", "B", "C", "D", "E"]),
      }),
    )
    .min(1)
    .max(100),
});
export const bulkUpdateQuestionAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkAnswersInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("仅管理员可执行");
    let updated = 0;
    for (const { number, answer } of data.answers) {
      const { error, count } = await context.supabase
        .from("math_questions")
        .update({ correct_answer: answer }, { count: "exact" })
        .eq("paper_id", data.paperId)
        .eq("question_number", number);
      if (error) throw new Error(`更新第 ${number} 题失败：${error.message}`);
      updated += count ?? 0;
    }
    return { ok: true, updated };
  });


// ===== 批量导入计算题（纯文字题，无 PDF）=====
const ImportCalcInput = z.object({
  folderId: z.string().uuid().nullable().optional(),
  questions: z
    .array(
      z.object({
        stem: z.string().min(1).max(4000),
        answer: z.string().max(2000).nullable().optional(),
        tags: z.array(z.string().min(1).max(80)).max(10).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const importCalcQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportCalcInput.parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isTeacher }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "teacher" }),
    ]);
    if (!isAdmin && !isTeacher) throw new Error("仅教师或管理员可执行");
    // 已验证教师/管理员身份；题库表的写策略仅管理员，这里用服务端客户端执行写入
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");

    const { data: paper, error: e0 } = await supabase
      .from("math_papers")
      .insert({
        year: null,
        name: "计算练习",
        pdf_path: null,
        answer_pdf_path: null,
        folder_id: data.folderId ?? null,
        kind: "paper",
        question_count: data.questions.length,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (e0 || !paper) throw new Error(e0?.message || "题集创建失败");

    try {
      const rows = data.questions.map((q, i) => ({
        paper_id: paper.id,
        year: null,
        question_number: i + 1,
        stem: q.stem,
        correct_answer: q.answer?.trim() || null,
        answer_type: "计算",
        tags: q.tags ?? [],
        stem_render_mode: "text",
        options_render_mode: "text",
      }));
      const { data: inserted, error: e1 } = await supabase
        .from("math_questions")
        .insert(rows)
        .select("id");
      if (e1) throw new Error("题目写入失败：" + e1.message);

      // 知识点标签：按名称查找，不存在的自动创建，再关联到题目
      const allNames = [...new Set(data.questions.flatMap((q) => q.tags ?? []))];
      if (allNames.length > 0 && inserted?.length) {
        const { data: existing } = await supabase
          .from("math_tags")
          .select("id, name, category")
          .in("name", allNames);
        const sorted = [...(existing ?? [])].sort(
          (a: any, b: any) => (a.category === "calc" ? 1 : 0) - (b.category === "calc" ? 1 : 0),
        );
        const tagIdByName = new Map<string, string>(
          sorted.map((t: any) => [t.name, t.id]),
        );
        const missing = allNames.filter((n) => !tagIdByName.has(n));
        if (missing.length > 0) {
          const { data: created, error: e2 } = await supabase
            .from("math_tags")
            .insert(missing.map((n) => ({ name: n, category: "calc" })))
            .select("id, name");
          if (e2) throw new Error("知识点创建失败：" + e2.message);
          for (const t of created ?? []) tagIdByName.set((t as any).name, (t as any).id);
        }
        const links: { question_id: string; tag_id: string; assigned_by_ai: boolean }[] = [];
        data.questions.forEach((q, i) => {
          const qid = (inserted as any[])[i]?.id;
          if (!qid) return;
          for (const name of q.tags ?? []) {
            const tid = tagIdByName.get(name);
            if (tid) links.push({ question_id: qid, tag_id: tid, assigned_by_ai: false });
          }
        });
        if (links.length > 0) {
          const { error: e3 } = await supabase.from("math_question_tags").insert(links);
          if (e3) throw new Error("知识点关联失败：" + e3.message);
        }
      }
    } catch (err) {
      await supabase.from("math_papers").delete().eq("id", paper.id);
      throw err;
    }

    return { paperId: paper.id as string, count: data.questions.length };
  });

// ===== 修改 / 删除单道计算题 =====
async function assertTeacherOrAdmin(context: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isTeacher }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "teacher" }),
  ]);
  if (!isAdmin && !isTeacher) throw new Error("仅教师或管理员可执行");
}

export const updateCalcQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        stem: z.string().min(1).max(4000),
        answer: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTeacherOrAdmin(context);
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    const { error } = await supabase
      .from("math_questions")
      .update({
        stem: data.stem,
        correct_answer: data.answer?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.questionId);
    if (error) throw new Error("保存失败：" + error.message);
    return { ok: true };
  });

export const deleteCalcQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTeacherOrAdmin(context);
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    // 先清理关联数据，再删题目本身
    await supabase.from("math_question_tags").delete().eq("question_id", data.questionId);
    await supabase.from("student_question_attempts").delete().eq("question_id", data.questionId);
    await supabase.from("student_question_attempt_log").delete().eq("question_id", data.questionId);
    const { error } = await supabase.from("math_questions").delete().eq("id", data.questionId);
    if (error) throw new Error("删除失败：" + error.message);
    return { ok: true };
  });
