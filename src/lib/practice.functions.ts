import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { gradeCalcAnswer } from "./calc-grade";
import { isMethodOnlyHint } from "./practice-hint";
import { isWholePaperAttempt, practiceAccuracy, validateHintQuestions } from "./exam-practice-stats";

type SupaCtx = { supabase: any; userId: string };

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Verify the caller owns this student account, and return accessible folder ids
async function resolveAccessibleFolders(ctx: SupaCtx, studentId: string): Promise<string[]> {
  // Use admin client to read the student row: after recent RLS hardening, students
  // can no longer SELECT their own row directly via the user-context client.
  const admin = await getAdmin();
  const { data: student } = await admin
    .from("students")
    .select("id, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) throw new Error("学生不存在");
  if (student.auth_user_id !== ctx.userId) {
    // allow teachers/admins to preview, but they wouldn't normally call this
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    const { data: isTeacher } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "teacher" });
    if (!isAdmin && !isTeacher) throw new Error("无权访问");
  }
  const { data: rows, error } = await admin.rpc("list_student_accessible_folders", {
    _student_id: studentId,
  });
  if (error) throw new Error(error.message);
  return (rows ?? [])
    .filter((r: any) => !r.is_ancestor && r.level !== "none")
    .map((r: any) => r.folder_id as string);
}


async function signImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  const admin = await getAdmin();
  const { data } = await admin.storage.from("math-question-images").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

type SafeQuestion = {
  id: string;
  paper_id: string;
  question_number: number;
  stem: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  answer_type: string | null;
  stem_render_mode: string | null;
  options_render_mode: string | null;
  image_url: string | null;
  options_image_url: string | null;
  paper_name?: string;
  year?: number | null;
  practice_hint: string | null;
};

async function loadQuestions(questionIds: string[]): Promise<SafeQuestion[]> {
  if (questionIds.length === 0) return [];
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("math_questions")
    .select(
      "id, paper_id, question_number, stem, option_a, option_b, option_c, option_d, option_e, answer_type, stem_render_mode, options_render_mode, image_path, options_image_path, practice_hint, math_papers(name, year)",
    )
    .in("id", questionIds);
  if (error) throw new Error(error.message);
  const out: SafeQuestion[] = [];
  for (const q of data ?? []) {
    out.push({
      id: q.id,
      paper_id: q.paper_id,
      question_number: q.question_number,
      stem: q.stem,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      answer_type: q.answer_type,
      stem_render_mode: q.stem_render_mode,
      options_render_mode: q.options_render_mode,
      image_url: await signImage(q.image_path),
      options_image_url: await signImage(q.options_image_path),
      paper_name: (q as any).math_papers?.name ?? null,
      year: (q as any).math_papers?.year ?? null,
      practice_hint: q.practice_hint && isMethodOnlyHint(q.practice_hint) ? q.practice_hint : null,
    });
  }
  // preserve order
  const order = new Map(questionIds.map((id, i) => [id, i]));
  out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return out;
}

// ---------- Public server functions ----------

export const listPracticePapers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const folderIds = await resolveAccessibleFolders(context, data.studentId);
    if (folderIds.length === 0) return { papers: [] };
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("math_papers")
      .select("id, year, name, kind, question_count")
      .in("folder_id", folderIds)
      .eq("kind", "paper")
      .order("year", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { papers: rows ?? [] };
  });

export const listPracticeTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const folderIds = await resolveAccessibleFolders(context, data.studentId);
    const admin = await getAdmin();
    const { data: tags } = await admin
      .from("math_tags")
      .select("id, name, category, color, parent_id")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (folderIds.length === 0) {
      return { tags: (tags ?? []).map((t: any) => ({ ...t, count: 0 })) };
    }
    // get accessible question ids
    const { data: papers } = await admin
      .from("math_papers")
      .select("id")
      .in("folder_id", folderIds)
      .eq("kind", "paper");
    const paperIds = (papers ?? []).map((p: any) => p.id);
    if (paperIds.length === 0) {
      return { tags: (tags ?? []).map((t: any) => ({ ...t, count: 0 })) };
    }
    const { data: questions } = await admin
      .from("math_questions")
      .select("id")
      .in("paper_id", paperIds);
    const qIds = (questions ?? []).map((q: any) => q.id);
    if (qIds.length === 0) {
      return { tags: (tags ?? []).map((t: any) => ({ ...t, count: 0 })) };
    }
    const counts = new Map<string, number>();
    // chunk in 1000
    for (let i = 0; i < qIds.length; i += 1000) {
      const slice = qIds.slice(i, i + 1000);
      const { data: rels } = await admin
        .from("math_question_tags")
        .select("tag_id, question_id")
        .in("question_id", slice);
      for (const r of rels ?? []) {
        counts.set(r.tag_id, (counts.get(r.tag_id) ?? 0) + 1);
      }
    }
    return {
      tags: (tags ?? []).map((t: any) => ({ ...t, count: counts.get(t.id) ?? 0 })),
    };
  });

export const loadPaperQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ studentId: z.string().uuid(), paperId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const folderIds = await resolveAccessibleFolders(context, data.studentId);
    if (folderIds.length === 0) throw new Error("无可练习的试卷");
    const admin = await getAdmin();
    const { data: paper } = await admin
      .from("math_papers")
      .select("id, name, year, folder_id")
      .eq("id", data.paperId)
      .maybeSingle();
    if (!paper || !folderIds.includes(paper.folder_id ?? "")) throw new Error("无权访问此试卷");
    const { data: rows } = await admin
      .from("math_questions")
      .select("id")
      .eq("paper_id", data.paperId)
      .order("question_number", { ascending: true });
    const ids = (rows ?? []).map((r: any) => r.id);
    const questions = await loadQuestions(ids);
    return { paper, questions };
  });

export const loadTargetedQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        studentId: z.string().uuid(),
        tagIds: z.array(z.string().uuid()).min(1),
        limit: z.number().int().min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const folderIds = await resolveAccessibleFolders(context, data.studentId);
    if (folderIds.length === 0) throw new Error("没有可访问的题目");
    const admin = await getAdmin();
    const { data: childTags } = await admin
      .from("math_tags")
      .select("id")
      .in("parent_id", data.tagIds);
    const expandedTagIds = Array.from(
      new Set([...data.tagIds, ...(childTags ?? []).map((tag: any) => tag.id as string)]),
    );
    const { data: papers } = await admin
      .from("math_papers")
      .select("id")
      .in("folder_id", folderIds)
      .eq("kind", "paper");
    const paperIds = (papers ?? []).map((p: any) => p.id);
    if (paperIds.length === 0) throw new Error("没有可访问的题目");
    const { data: rels } = await admin
      .from("math_question_tags")
      .select("question_id, tag_id")
      .in("tag_id", expandedTagIds);
    const candidateIds = Array.from(new Set((rels ?? []).map((r: any) => r.question_id as string)));
    if (candidateIds.length === 0) throw new Error("所选知识点暂无题目");
    // restrict to accessible papers
    const { data: qrows } = await admin
      .from("math_questions")
      .select("id, paper_id")
      .in("id", candidateIds)
      .in("paper_id", paperIds);
    const pool = (qrows ?? []).map((q: any) => q.id as string);
    if (pool.length === 0) throw new Error("所选知识点在可访问范围内暂无题目");
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, data.limit);
    const questions = await loadQuestions(chosen);
    return { questions };
  });

export const getPracticeStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // The caller is the student; we use the per-user attempt count
    const { data: attempts } = await context.supabase
      .from("student_question_attempts")
      .select("question_id, attempts, wrong_count")
      .eq("user_id", context.userId);
    const doneCount = (attempts ?? []).length;
    const totalWrong = (attempts ?? []).reduce((s: number, a: any) => s + (a.wrong_count ?? 0), 0);
    void data;
    return {
      doneCount,
      totalWrong,
      aiUnlocked: doneCount >= 50,
      aiThreshold: 50,
    };
  });

export const loadAiQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ studentId: z.string().uuid(), limit: z.number().int().min(1).max(20).default(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // gather attempts
    const { data: attempts } = await context.supabase
      .from("student_question_attempts")
      .select("question_id, attempts, wrong_count")
      .eq("user_id", context.userId);
    const rows = attempts ?? [];
    if (rows.length < 50) throw new Error("已做题数不足 50 道，无法解锁 AI 刷题");

    const folderIds = await resolveAccessibleFolders(context, data.studentId);
    if (folderIds.length === 0) throw new Error("无可练习的题目");
    const admin = await getAdmin();
    const { data: papers } = await admin
      .from("math_papers")
      .select("id")
      .in("folder_id", folderIds)
      .eq("kind", "paper");
    const paperIds = (papers ?? []).map((p: any) => p.id);

    // compute per-tag weakness (sum wrong_count / sum attempts)
    const wrongIds = rows.filter((r: any) => (r.wrong_count ?? 0) > 0).map((r: any) => r.question_id);
    const tagWrong = new Map<string, number>();
    const tagTotal = new Map<string, number>();
    const attemptedSet = new Set(rows.map((r: any) => r.question_id));
    if (wrongIds.length > 0) {
      const { data: rels } = await admin
        .from("math_question_tags")
        .select("question_id, tag_id")
        .in("question_id", rows.map((r: any) => r.question_id));
      const wrongById = new Map<string, number>(rows.map((r: any) => [r.question_id, r.wrong_count ?? 0]));
      const attemptsById = new Map<string, number>(rows.map((r: any) => [r.question_id, r.attempts ?? 0]));
      for (const r of rels ?? []) {
        tagWrong.set(r.tag_id, (tagWrong.get(r.tag_id) ?? 0) + (wrongById.get(r.question_id) ?? 0));
        tagTotal.set(r.tag_id, (tagTotal.get(r.tag_id) ?? 0) + (attemptsById.get(r.question_id) ?? 0));
      }
    }

    // weakness score = wrong/(total+1), weighted sampling
    const tagWeights = Array.from(tagWrong.entries())
      .map(([tag, wrong]) => ({ tag, w: wrong / ((tagTotal.get(tag) ?? 0) + 1) }))
      .filter((t) => t.w > 0);
    if (tagWeights.length === 0) throw new Error("还没有错题数据，再多做一些题目吧");

    // pick candidate questions by tags, weighted random
    const weakTagIds = tagWeights.map((t) => t.tag);
    const { data: candRels } = await admin
      .from("math_question_tags")
      .select("question_id, tag_id")
      .in("tag_id", weakTagIds);
    const candidateScore = new Map<string, number>();
    const weightByTag = new Map(tagWeights.map((t) => [t.tag, t.w]));
    for (const r of candRels ?? []) {
      if (attemptedSet.has(r.question_id)) continue; // prefer new questions
      candidateScore.set(
        r.question_id,
        (candidateScore.get(r.question_id) ?? 0) + (weightByTag.get(r.tag_id) ?? 0),
      );
    }
    // if no new questions, fall back to wrong ones
    let candidates = Array.from(candidateScore.entries());
    if (candidates.length === 0) {
      for (const r of candRels ?? []) {
        if (!wrongIds.includes(r.question_id)) continue;
        candidateScore.set(
          r.question_id,
          (candidateScore.get(r.question_id) ?? 0) + (weightByTag.get(r.tag_id) ?? 0),
        );
      }
      candidates = Array.from(candidateScore.entries());
    }
    if (candidates.length === 0) throw new Error("没有可用的练习题");

    // filter to accessible
    const { data: qrows } = await admin
      .from("math_questions")
      .select("id, paper_id")
      .in("id", candidates.map(([id]) => id))
      .in("paper_id", paperIds);
    const accessibleIds = new Set((qrows ?? []).map((q: any) => q.id));
    candidates = candidates.filter(([id]) => accessibleIds.has(id));
    if (candidates.length === 0) throw new Error("可访问范围内没有匹配的练习题");

    // weighted random sampling without replacement
    const chosen: string[] = [];
    while (chosen.length < data.limit && candidates.length > 0) {
      const total = candidates.reduce((s, [, w]) => s + w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < candidates.length; idx++) {
        r -= candidates[idx][1];
        if (r <= 0) break;
      }
      if (idx >= candidates.length) idx = candidates.length - 1;
      chosen.push(candidates[idx][0]);
      candidates.splice(idx, 1);
    }
    const questions = await loadQuestions(chosen);
    return { questions, weakTags: weakTagIds.slice(0, 5) };
  });

// ---------- 计算练习（填空题） ----------

export const listCalcPracticeTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await resolveAccessibleFolders(context, data.studentId);
    const admin = await getAdmin();
    const { data: tags } = await admin
      .from("math_tags")
      .select("id, name, category, color, parent_id")
      .eq("category", "calc")
      .order("name", { ascending: true });
    const tagIds = (tags ?? []).map((t: any) => t.id as string);
    const counts = new Map<string, number>();
    if (tagIds.length > 0) {
      for (let from = 0; ; from += 1000) {
        const { data: rels } = await admin
          .from("math_question_tags")
          .select("tag_id")
          .in("tag_id", tagIds)
          .range(from, from + 999);
        for (const r of rels ?? []) counts.set(r.tag_id, (counts.get(r.tag_id) ?? 0) + 1);
        if (!rels || rels.length < 1000) break;
      }
    }
    return { tags: (tags ?? []).map((t: any) => ({ ...t, count: counts.get(t.id) ?? 0 })) };
  });

export const loadCalcPracticeQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        studentId: z.string().uuid(),
        tagIds: z.array(z.string().uuid()).min(1),
        limit: z.number().int().min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await resolveAccessibleFolders(context, data.studentId);
    const admin = await getAdmin();
    const pool = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: rels } = await admin
        .from("math_question_tags")
        .select("question_id")
        .in("tag_id", data.tagIds)
        .range(from, from + 999);
      for (const r of rels ?? []) pool.add(r.question_id as string);
      if (!rels || rels.length < 1000) break;
    }
    const ids = Array.from(pool);
    const calcIds: string[] = [];
    for (let i = 0; i < ids.length; i += 300) {
      const { data: rows } = await admin
        .from("math_questions")
        .select("id")
        .in("id", ids.slice(i, i + 300))
        .eq("answer_type", "计算");
      for (const r of rows ?? []) calcIds.push(r.id as string);
    }
    if (calcIds.length === 0) throw new Error("所选知识点暂无计算题");
    for (let i = calcIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [calcIds[i], calcIds[j]] = [calcIds[j], calcIds[i]];
    }
    const questions = await loadQuestions(calcIds.slice(0, data.limit));
    return { questions };
  });

export const submitPracticeAttempts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        studentId: z.string().uuid(),
        mode: z.enum(["paper", "targeted", "ai", "calc"]),
        paperId: z.string().uuid().nullable().optional(),
        tagIds: z.array(z.string().uuid()).optional().default([]),
        hintQuestionIds: z.array(z.string().uuid()).max(50).optional(),
        answers: z
          .array(
            z.object({
              question_id: z.string().uuid(),
              answer: z.string().max(500).nullable(),
            }),
          )
          .min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const accessibleFolders = await resolveAccessibleFolders(context, data.studentId);
    const admin = await getAdmin();
    const ids = data.answers.map((a) => a.question_id);
    if (new Set(ids).size !== ids.length) throw new Error("请勿重复提交同一道题");
    const { data: rows } = await admin
      .from("math_questions")
      .select("id, paper_id, correct_answer, answer_type, practice_hint, math_papers(folder_id)")
      .in("id", ids);
    if (rows?.length !== ids.length || rows.some((q: any) => q.answer_type !== "计算" && !accessibleFolders.includes(q.math_papers?.folder_id))) {
      throw new Error("题目不存在或无权访问");
    }
    const rowMap = new Map<string, any>((rows ?? []).map((r: any) => [r.id, r]));
    if (data.mode === "paper" && (!data.paperId || rows?.some((q) => q.paper_id !== data.paperId))) throw new Error("本次真题卷与提交题目不匹配");
    const hintIds = data.hintQuestionIds === undefined ? null : validateHintQuestions(data.hintQuestionIds, ids, (rows ?? []).filter((q) => q.practice_hint && isMethodOnlyHint(q.practice_hint)).map((q) => q.id));

    const graded = data.answers.map((a) => {
      const row = rowMap.get(a.question_id);
      if (row?.answer_type === "计算") {
        const expected = (row.correct_answer ?? "").toString().trim();
        const given = (a.answer ?? "").trim();
        return {
          question_id: a.question_id,
          answer: given,
          is_correct: gradeCalcAnswer(given, expected),
          correct_answer: expected,
        };
      }
      const expected = (row?.correct_answer ?? "").toString().trim().toUpperCase();
      const given = (a.answer ?? "").trim().toUpperCase();
      const is_correct = !!expected && given === expected;
      return { question_id: a.question_id, answer: given, is_correct, correct_answer: expected };
    });

    // load existing attempts to merge
    const { data: existing } = await context.supabase
      .from("student_question_attempts")
      .select("id, question_id, attempts, wrong_count")
      .eq("user_id", context.userId)
      .in("question_id", ids);
    const existingMap = new Map<string, any>((existing ?? []).map((r: any) => [r.question_id, r]));

    const upserts = graded.map((g) => {
      const prev = existingMap.get(g.question_id);
      return {
        user_id: context.userId,
        question_id: g.question_id,
        attempts: (prev?.attempts ?? 0) + 1,
        wrong_count: (prev?.wrong_count ?? 0) + (g.is_correct ? 0 : 1),
        last_is_correct: g.is_correct,
        last_answer: g.answer,
        last_attempt_at: new Date().toISOString(),
      };
    });

    // upsert one by one (small batch ok)
    for (const row of upserts) {
      await context.supabase
        .from("student_question_attempts")
        .upsert(row, { onConflict: "user_id,question_id" });
    }

    const total = graded.length;
    const correct = graded.filter((g) => g.is_correct).length;
    const score = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
    const nowIso = new Date().toISOString();
    const { data: sessionRow, error: sessionError } = await context.supabase
      .from("student_practice_sessions")
      .insert({
        user_id: context.userId,
        student_id: data.studentId,
        mode: data.mode,
        paper_id: data.paperId ?? null,
        tag_ids: data.tagIds ?? [],
        question_ids: ids,
        hint_question_ids: hintIds,
        total,
        correct,
        score,
        completed_at: nowIso,
      })
      .select("id")
      .single();
    const sessionId = (sessionRow?.id as string | undefined) ?? null;
    if (sessionError || !sessionId) throw new Error("练习记录保存失败，请稍后重试");

    // Insert one log row per question (full history of correctness + timestamp)
    const logRows = graded.map((g) => ({
      user_id: context.userId,
      question_id: g.question_id,
      session_id: sessionId,
      mode: data.mode,
      answer: g.answer || null,
      correct_answer: g.correct_answer || null,
      is_correct: g.is_correct,
      attempted_at: nowIso,
    }));
    if (logRows.length > 0) {
      const { error } = await admin.from("student_question_attempt_log").insert(logRows);
      if (error) throw new Error("逐题反馈保存失败，请稍后重试");
    }

    return { graded, total, correct, score, sessionId };
  });

export const getExamPracticeStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Verify student identity through the authenticated own-profile RPC first.
    const { data: ownProfiles, error: ownError } = await context.supabase.rpc("get_my_student_profile");
    if (ownError) throw new Error("无法确认学生访问权限");
    const own = ownProfiles?.find((s: { id: string }) => s.id === data.studentId);
    let targetUserId: string | null = own?.auth_user_id ?? null;
    if (!own) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      const { data: isTeacher } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "teacher" });
      if (!isAdmin && !isTeacher) throw new Error("无权访问");
      const { data: student } = await context.supabase.from("students").select("auth_user_id").eq("id", data.studentId).maybeSingle();
      if (!student) throw new Error("学生不存在或无权访问");
      targetUserId = student.auth_user_id;
    }
    if (!targetUserId) return { papers: [] };
    const admin = await getAdmin();
    const sessions: Array<{ id: string; paper_id: string | null; question_ids: string[]; hint_question_ids: string[] | null; completed_at: string | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await admin.from("student_practice_sessions").select("id,paper_id,question_ids,hint_question_ids,completed_at").eq("user_id", targetUserId).eq("student_id", data.studentId).eq("mode", "paper").not("completed_at", "is", null).order("completed_at", { ascending: false }).order("id").range(from, from + 999);
      if (error) throw new Error("整卷练习记录加载失败");
      sessions.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const paperIds = [...new Set(sessions.flatMap((s) => s.paper_id ? [s.paper_id] : []))];
    if (!paperIds.length) return { papers: [] };
    const { data: papers, error: paperError } = await admin.from("math_papers").select("id,name,year").eq("kind", "paper").in("id", paperIds);
    if (paperError) throw new Error("真题卷加载失败");
    const questions: Array<{ id: string; paper_id: string; question_number: number }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await admin.from("math_questions").select("id,paper_id,question_number").in("paper_id", paperIds).order("id").range(from, from + 999);
      if (error) throw new Error("真题题目加载失败");
      questions.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const wholeSessions = sessions.filter((s) => isWholePaperAttempt(s.question_ids, questions.filter((q) => q.paper_id === s.paper_id).map((q) => q.id)));
    if (!wholeSessions.length) return { papers: [] };
    const logs: Array<{ session_id: string | null; question_id: string; is_correct: boolean }> = [];
    for (let i = 0; i < wholeSessions.length; i += 100) {
      for (let from = 0; ; from += 1000) {
        const { data: page, error } = await admin.from("student_question_attempt_log").select("session_id,question_id,is_correct").eq("user_id", targetUserId).in("session_id", wholeSessions.slice(i, i + 100).map((s) => s.id)).order("id").range(from, from + 999);
        if (error) throw new Error("逐题统计加载失败");
        logs.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
    }
    const tagNames = new Map<string, Set<string>>();
    for (let i = 0; i < questions.length; i += 200) {
      const { data: relations, error } = await admin.from("math_question_tags").select("question_id,math_tags(name)").in("question_id", questions.slice(i, i + 200).map((q) => q.id));
      if (error) throw new Error("知识点加载失败");
      for (const relation of relations ?? []) {
        const name = (relation.math_tags as { name: string } | null)?.name;
        const names = tagNames.get(relation.question_id) ?? new Set<string>();
        if (name) names.add(name);
        tagNames.set(relation.question_id, names);
      }
    }
    return { papers: (papers ?? []).flatMap((paper) => {
      const attempts = wholeSessions.filter((s) => s.paper_id === paper.id).flatMap((session) => {
        const result = new Map(logs.filter((l) => l.session_id === session.id).map((l) => [l.question_id, l]));
        if (!session.question_ids.every((id) => result.has(id))) return [];
        const wrong = session.question_ids.filter((id) => !result.get(id)?.is_correct).map((id) => ({ number: questionMap.get(id)?.question_number ?? 0, tags: [...(tagNames.get(id) ?? [])] })).sort((a, b) => a.number - b.number);
        const hints = session.hint_question_ids === null ? null : session.hint_question_ids.map((id) => questionMap.get(id)?.question_number).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
        const total = session.question_ids.length;
        return [{ id: session.id, completedAt: session.completed_at, total, correct: total - wrong.length, accuracy: practiceAccuracy(total - wrong.length, total), wrong, hintNumbers: hints }];
      });
      const total = attempts.reduce((sum, a) => sum + a.total, 0);
      const correct = attempts.reduce((sum, a) => sum + a.correct, 0);
      return attempts.length ? [{ id: paper.id, name: paper.name, year: paper.year, total, correct, accuracy: practiceAccuracy(correct, total), attempts }] : [];
    }).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) };
  });

// ---------- read history (account owner or admin) ----------

export const listPracticeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        studentId: z.string().uuid().optional(),
        questionId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // figure out the target user_id (account owner) and authorize the caller
    let targetUserId = context.userId;
    if (data.studentId) {
      const { data: student } = await context.supabase
        .from("students")
        .select("auth_user_id, created_by")
        .eq("id", data.studentId)
        .maybeSingle();
      if (!student) throw new Error("学生不存在");
      const isOwner = student.auth_user_id === context.userId;
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isOwner && !isAdmin) throw new Error("无权访问");
      if (student.auth_user_id) targetUserId = student.auth_user_id as string;
    }
    // Use admin client so correct_answer column (revoked from authenticated) is readable
    // for legitimate history review. Authorization is enforced above.
    const admin = await getAdmin();
    let q = admin
      .from("student_question_attempt_log")
      .select("id, question_id, session_id, mode, answer, correct_answer, is_correct, attempted_at")
      .eq("user_id", targetUserId)
      .order("attempted_at", { ascending: false })
      .limit(data.limit);
    if (data.questionId) q = q.eq("question_id", data.questionId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });



// ---------- 各知识点正确率 ----------
export const getTagAccuracy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: student } = await admin
      .from("students")
      .select("id, auth_user_id")
      .eq("id", data.studentId)
      .maybeSingle();
    if (!student) throw new Error("学生不存在");
    if (student.auth_user_id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      const { data: isTeacher } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "teacher" });
      if (!isAdmin && !isTeacher) throw new Error("无权访问");
    }
    if (!student.auth_user_id) return { tags: [] };
    const logs: Array<{ question_id: string; is_correct: boolean }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: rows } = await admin
        .from("student_question_attempt_log")
        .select("question_id, is_correct")
        .eq("user_id", student.auth_user_id)
        .range(from, from + 999);
      logs.push(...((rows ?? []) as any));
      if (!rows || rows.length < 1000) break;
    }
    if (logs.length === 0) return { tags: [] };
    const qIds = Array.from(new Set(logs.map((l) => l.question_id)));
    const qTags = new Map<string, Set<string>>();
    for (let i = 0; i < qIds.length; i += 300) {
      const { data: rels } = await admin
        .from("math_question_tags")
        .select("question_id, tag_id")
        .in("question_id", qIds.slice(i, i + 300));
      for (const r of rels ?? []) {
        if (!qTags.has(r.question_id)) qTags.set(r.question_id, new Set());
        qTags.get(r.question_id)!.add(r.tag_id);
      }
    }
    const { data: tags } = await admin.from("math_tags").select("id, name, category, parent_id");
    const tagMap = new Map((tags ?? []).map((t: any) => [t.id, t]));
    const stat = new Map<string, { total: number; correct: number }>();
    for (const l of logs) {
      const direct = qTags.get(l.question_id) ?? new Set<string>();
      const all = new Set(direct);
      for (const t of direct) {
        const p = tagMap.get(t)?.parent_id;
        if (p) all.add(p); // 二级标签汇总到一级
      }
      for (const t of all) {
        const s = stat.get(t) ?? { total: 0, correct: 0 };
        s.total++;
        if (l.is_correct) s.correct++;
        stat.set(t, s);
      }
    }
    return {
      tags: Array.from(stat.entries())
        .filter(([id]) => tagMap.has(id))
        .map(([id, s]) => {
          const t: any = tagMap.get(id);
          return { id, name: t.name, category: t.category, parent_id: t.parent_id, total: s.total, correct: s.correct };
        }),
    };
  });
