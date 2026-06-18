import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type SupaCtx = { supabase: any; userId: string };

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AuthorizeResult = {
  student: { id: string; name: string; auth_user_id: string | null };
  isOwner: boolean;
  isStaff: boolean;
};

async function authorize(ctx: SupaCtx, studentId: string): Promise<AuthorizeResult> {
  const admin = await getAdmin();
  const { data: student } = await admin
    .from("students")
    .select("id, name, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) throw new Error("学生不存在");
  const isOwner = student.auth_user_id === ctx.userId;
  let isStaff = false;
  if (!isOwner) {
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    const { data: isTeacher } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "teacher",
    });
    isStaff = !!(isAdmin || isTeacher);
    if (!isStaff) throw new Error("无权访问");
  } else {
    // owner accessing their own profile
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    const { data: isTeacher } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "teacher",
    });
    isStaff = !!(isAdmin || isTeacher);
  }
  return { student: student as any, isOwner, isStaff };
}

export const getLearningAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isOwner, isStaff } = await authorize(context, data.studentId);
    const admin = await getAdmin();
    const [{ data: row }, { data: archives }] = await Promise.all([
      admin
        .from("student_learning_analytics")
        .select("content, chart_data, generated_at")
        .eq("student_id", data.studentId)
        .maybeSingle(),
      admin
        .from("student_learning_analytics_archives")
        .select("id, content, chart_data, published_at")
        .eq("student_id", data.studentId)
        .order("published_at", { ascending: false }),
    ]);

    const archiveList = (archives ?? []).map((a: any) => ({
      id: a.id as string,
      content: a.content as string,
      chartData: (a.chart_data ?? {}) as any,
      publishedAt: a.published_at as string,
    }));

    if (isOwner && !isStaff) {
      return {
        role: "student" as const,
        content: "",
        chartData: {} as any,
        generatedAt: null as string | null,
        archives: archiveList,
      };
    }

    return {
      role: "teacher" as const,
      content: row?.content ?? "",
      chartData: (row?.chart_data ?? {}) as any,
      generatedAt: row?.generated_at ?? null,
      archives: archiveList,
    };
  });

export const generateLearningAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { student, isStaff } = await authorize(context, data.studentId);
    if (!isStaff) throw new Error("仅教师可以生成分析");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const admin = await getAdmin();

    // 1. Gather data
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceISO = since.toISOString().slice(0, 10);

    const [{ data: ratings }, { data: items }, { data: attempts }] = await Promise.all([
      admin
        .from("ratings")
        .select(
          "lesson_date, lesson_name, summary, overall_assessment, focus, interaction, discipline, accuracy, overall_progress, progress_items(item_name, percentage, sort_order)",
        )
        .eq("student_id", data.studentId)
        .gte("lesson_date", sinceISO)
        .order("lesson_date", { ascending: true }),
      admin
        .from("assessment_items")
        .select("category, item_name, rating, comment, updated_at")
        .eq("student_id", data.studentId),
      student.auth_user_id
        ? admin
            .from("student_question_attempts")
            .select(
              "question_id, attempts, wrong_count, last_is_correct, last_attempt_at, math_questions(question_number, math_question_tags(math_tags(name, category)))",
            )
            .eq("user_id", student.auth_user_id)
            .order("last_attempt_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const lessonsTrend = (ratings ?? []).map((r: any) => ({
      date: r.lesson_date,
      lesson: r.lesson_name ?? "",
      focus: r.focus,
      interaction: r.interaction,
      discipline: r.discipline,
      accuracy: r.accuracy,
      overall: r.overall_assessment,
      progress: r.overall_progress,
      teacher_summary: r.summary ?? "",
      progress_items: ((r.progress_items ?? []) as any[])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((p) => ({ item: p.item_name, percentage: p.percentage })),
    }));

    const tagStats = new Map<string, { tag: string; category: string; total: number; correct: number }>();
    let totalAttempts = 0;
    let totalCorrect = 0;
    for (const a of (attempts ?? []) as any[]) {
      totalAttempts += 1;
      if (a.last_is_correct) totalCorrect += 1;
      const tags = a.math_questions?.math_question_tags ?? [];
      for (const t of tags) {
        const tg = t.math_tags;
        if (!tg?.name) continue;
        const key = tg.name;
        const ex = tagStats.get(key) ?? { tag: tg.name, category: tg.category ?? "", total: 0, correct: 0 };
        ex.total += 1;
        if (a.last_is_correct) ex.correct += 1;
        tagStats.set(key, ex);
      }
    }
    const tagPerformance = Array.from(tagStats.values())
      .map((t) => ({ ...t, accuracy: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    const assessmentByCategory: Record<string, Array<{ item: string; rating: number | null }>> = {};
    for (const it of (items ?? []) as any[]) {
      const cat = it.category as string;
      (assessmentByCategory[cat] ||= []).push({ item: it.item_name, rating: it.rating });
    }

    const chartData = {
      lessonsTrend,
      tagPerformance,
      assessmentByCategory,
      summary: {
        lessonCount: lessonsTrend.length,
        attemptCount: totalAttempts,
        correctCount: totalCorrect,
        accuracyPct: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
      },
    };

    const compact = {
      student_name: student.name,
      window_days: 90,
      lessons: lessonsTrend,
      assessment_items: items ?? [],
      tag_performance: tagPerformance,
      overall_attempts: chartData.summary,
    };

    const prompt = `你是一位资深的数学竞赛教学顾问。请根据以下学生的最近 90 天学习数据，对学生进行多维度的学习分析与掌握情况评估。

【学生数据 JSON】
${JSON.stringify(compact, null, 2)}

【输出要求】请输出一段结构化的中文 Markdown 分析报告，包含以下章节（使用二级标题 ##）：
## 整体概览
2-3 句总结学生近期的整体表现与学习状态。

## 课堂表现趋势
基于 lessons（按时间排序）分析专注力 / 互动性 / 课堂纪律 / 做题准确率 这四个维度的变化趋势与亮点 / 隐患。

## 综合素质分析
基于 assessment_items 分类（knowledge=知识点、thinking=核心思维、learning_quality=学习品质），点评强项与待提升项。

## 知识点掌握情况
基于 tag_performance，挑出掌握较好（高准确率）和薄弱（低准确率或样本少）的知识点，给出具体建议。

## 后续学习建议
3-5 条具体、可执行的学习建议，针对该学生的薄弱环节。

要求：
- 语言专业、温和、鼓励性；不要使用"该生"，使用学生姓名"${student.name}"或"你"。
- 不要重复罗列原始数据数字，重在洞察和建议。
- 不要输出 JSON 或代码块，直接输出 Markdown 正文。`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度不足，请到工作区设置补充额度");
      throw new Error(`AI 调用失败 ${resp.status}: ${t.slice(0, 200)}`);
    }
    const json = await resp.json();
    const content = String(json.choices?.[0]?.message?.content ?? "").trim();
    if (!content) throw new Error("AI 返回为空");

    const generatedAt = new Date().toISOString();
    const { error: upErr } = await admin
      .from("student_learning_analytics")
      .upsert(
        {
          student_id: data.studentId,
          content,
          chart_data: chartData,
          generated_at: generatedAt,
          updated_by: context.userId,
        },
        { onConflict: "student_id" },
      );
    if (upErr) throw new Error(upErr.message);

    return { content, chartData, generatedAt };
  });

export const updateLearningAnalyticsContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ studentId: z.string().uuid(), content: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isStaff } = await authorize(context, data.studentId);
    if (!isStaff) throw new Error("仅教师可以编辑");
    const admin = await getAdmin();
    const { error } = await admin
      .from("student_learning_analytics")
      .upsert(
        {
          student_id: data.studentId,
          content: data.content,
          updated_by: context.userId,
        },
        { onConflict: "student_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishLearningAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isStaff } = await authorize(context, data.studentId);
    if (!isStaff) throw new Error("仅教师可以发送");
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("student_learning_analytics")
      .select("content, chart_data")
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (!row || !row.content) throw new Error("尚无分析内容可发送");
    const publishedAt = new Date().toISOString();
    const { data: inserted, error } = await admin
      .from("student_learning_analytics_archives")
      .insert({
        student_id: data.studentId,
        content: row.content,
        chart_data: row.chart_data ?? {},
        published_at: publishedAt,
        published_by: context.userId,
      })
      .select("id, published_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, publishedAt: inserted.published_at };
  });

export const deleteLearningAnalyticsArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ studentId: z.string().uuid(), archiveId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isStaff } = await authorize(context, data.studentId);
    if (!isStaff) throw new Error("仅教师可以删除");
    const admin = await getAdmin();
    const { error } = await admin
      .from("student_learning_analytics_archives")
      .delete()
      .eq("id", data.archiveId)
      .eq("student_id", data.studentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
