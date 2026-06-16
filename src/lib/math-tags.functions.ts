import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TagInput = z.object({
  name: z.string().min(1).max(80),
  category: z.string().min(1).max(40).default("knowledge"),
  color: z.string().max(20).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("仅管理员可执行");
}

export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("math_tags")
      .select("id, name, category, color, description, created_at")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { tags: data ?? [] };
  });

export const createTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TagInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("math_tags")
      .insert({
        name: data.name,
        category: data.category,
        color: data.color ?? null,
        description: data.description ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const updateTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80),
        category: z.string().min(1).max(40),
        color: z.string().max(20).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_tags")
      .update({
        name: data.name,
        category: data.category,
        color: data.color ?? null,
        description: data.description ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("math_tags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Question <-> Tag manual assignment ----
export const setQuestionTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        tagIds: z.array(z.string().uuid()).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { error: eDel } = await supabase
      .from("math_question_tags")
      .delete()
      .eq("question_id", data.questionId);
    if (eDel) throw new Error(eDel.message);
    if (data.tagIds.length === 0) return { ok: true };
    const rows = data.tagIds.map((tid) => ({
      question_id: data.questionId,
      tag_id: tid,
      assigned_by_ai: false,
    }));
    const { error } = await supabase.from("math_question_tags").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listQuestionTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ questionIds: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("math_question_tags")
      .select("question_id, tag_id, assigned_by_ai")
      .in("question_id", data.questionIds);
    if (error) throw new Error(error.message);
    return { links: rows ?? [] };
  });

// ---- AI auto-tagging for a whole paper ----
export const autoTagPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        paperId: z.string().uuid(),
        overwrite: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { supabase } = context;
    const { data: questions, error: e1 } = await supabase
      .from("math_questions")
      .select("id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer")
      .eq("paper_id", data.paperId)
      .order("question_number", { ascending: true });
    if (e1) throw new Error(e1.message);
    if (!questions || questions.length === 0) throw new Error("此试卷暂无题目");

    const { data: tags, error: e2 } = await supabase
      .from("math_tags")
      .select("id, name, category, description");
    if (e2) throw new Error(e2.message);
    if (!tags || tags.length === 0) throw new Error("请先创建至少一个标签");

    const tagCatalog = tags
      .map(
        (t: any) =>
          `- [${t.category}] ${t.name} (id=${t.id})${t.description ? ` — ${t.description}` : ""}`,
      )
      .join("\n");

    const qPayload = questions.map((q: any) => ({
      id: q.id,
      number: q.question_number,
      stem: q.stem,
      options: {
        A: q.option_a,
        B: q.option_b,
        C: q.option_c,
        D: q.option_d,
        E: q.option_e,
      },
      answer: q.correct_answer,
    }));

    const prompt = `你是一名 AMC 8 数学竞赛资深教练。下面是一份试卷中的题目，请基于题干、选项与答案，为每道题从给定标签库中挑选最相关的标签（按 id 引用）。

【标签库】
${tagCatalog}

【打 tag 规则】
- 同一类别（category）下尽量只选 1-2 个最贴切的标签；不同类别可以各自选。
- 若没有足够把握，宁可少打，不要硬塞。
- 只能使用标签库里出现的 id，禁止编造新 id 或新名字。

【题目列表（JSON）】
${JSON.stringify(qPayload)}

请只返回严格 JSON：
{ "assignments": [ { "question_id": "<uuid>", "tag_ids": ["<uuid>", ...] }, ... ] }`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 16000,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度不足，请到工作区设置补充额度");
      throw new Error(`AI 打标签失败 ${resp.status}: ${t.slice(0, 200)}`);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回为空");
    let text = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("AI 返回 JSON 无法解析");
    }
    const assignments: Array<{ question_id: string; tag_ids: string[] }> = parsed?.assignments ?? [];
    const validQuestionIds = new Set(questions.map((q: any) => q.id));
    const validTagIds = new Set(tags.map((t: any) => t.id));
    const rows: Array<{ question_id: string; tag_id: string; assigned_by_ai: boolean }> = [];
    for (const a of assignments) {
      if (!validQuestionIds.has(a.question_id)) continue;
      for (const tid of a.tag_ids ?? []) {
        if (validTagIds.has(tid)) {
          rows.push({ question_id: a.question_id, tag_id: tid, assigned_by_ai: true });
        }
      }
    }

    if (data.overwrite) {
      const qIds = questions.map((q: any) => q.id);
      const { error: eDel } = await supabase
        .from("math_question_tags")
        .delete()
        .in("question_id", qIds);
      if (eDel) throw new Error(eDel.message);
    }

    if (rows.length > 0) {
      // upsert-like: ignore duplicates
      const { error } = await supabase
        .from("math_question_tags")
        .upsert(rows, { onConflict: "question_id,tag_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    return { ok: true, inserted: rows.length, totalQuestions: questions.length };
  });
