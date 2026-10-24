import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fetchMeetingSessions } from "@/lib/meeting-sessions";
import { mergeMeetingNotes } from "@/lib/meeting-notes";
import { parsePluginRating, NEW_RATING_DEFAULTS } from "@/lib/meeting-rating";

export const pluginCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...pluginCors, "Content-Type": "application/json" } });

export async function handleMeetingPlugin(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return json({ error: "请先在插件中登录 mooodle 教师账号" }, 401);
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "登录已失效，请在插件中重新登录" }, 401);
  let body: { action?: string; date?: string; sessionId?: string; text?: string; rating?: unknown };
  try { body = await request.json(); } catch { return json({ error: "请求格式错误" }, 400); }
  try {
    const sessions = await fetchMeetingSessions(String(body.date || ""), { client, uid: auth.user.id });
    if (body.action === "list") return json({ sessions });
    if (body.action !== "save") return json({ error: "不支持的操作" }, 400);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 100000) return json({ error: "纪要为空或过长" }, 400);
    const lesson = sessions.find(s => s.id === body.sessionId);
    if (!lesson) return json({ error: "课次不存在或已取消，请重新匹配" }, 404);
    if (lesson.ambiguousDay) return json({ error: "同一学生当天有多节课，目前不能按课次独立存档，请到学生档案手动保存" }, 409);
    let input;
    try { input = parsePluginRating(body.rating); } catch (e) { return json({ error: (e as Error).message }, 400); }
    const uid = auth.user.id;
    const { data: rating, error } = await client.from("ratings").select("id,summary").eq("student_id", lesson.studentId).eq("lesson_date", lesson.date).maybeSingle();
    if (error) throw error;
    const block = mergeMeetingNotes("", text, "replace");
    let ratingId: string;
    if (!rating) {
      const { data: created, error: insError } = await client.from("ratings").insert({
        student_id: lesson.studentId, lesson_date: lesson.date, created_by: uid, summary: block,
        focus: input.scores.focus ?? NEW_RATING_DEFAULTS.focus, interaction: input.scores.interaction ?? NEW_RATING_DEFAULTS.interaction,
        discipline: input.scores.discipline ?? NEW_RATING_DEFAULTS.discipline, accuracy: input.scores.accuracy ?? NEW_RATING_DEFAULTS.accuracy,
        overall_assessment: input.overall ?? NEW_RATING_DEFAULTS.overall_assessment, overall_progress: input.overallProgress ?? NEW_RATING_DEFAULTS.overall_progress,
      }).select("id,summary").maybeSingle();
      if (insError || !created) return json({ error: "新建课堂评分失败，可能已有人同时保存，请重新匹配后重试" }, 409);
      if (created.summary !== block) return json({ error: "保存回读未确认，请查看学生档案，不要重复提交" }, 500);
      ratingId = created.id;
    } else {
      const next = mergeMeetingNotes(rating.summary || "", block, "append");
      const patch: { summary: string; focus?: number; interaction?: number; discipline?: number; accuracy?: number; overall_assessment?: number; overall_progress?: number } = { summary: next, ...input.scores };
      if (input.overall !== undefined) patch.overall_assessment = input.overall;
      if (input.overallProgress !== undefined) patch.overall_progress = input.overallProgress;
      let q = client.from("ratings").update(patch).eq("id", rating.id);
      q = rating.summary === null ? q.is("summary", null) : q.eq("summary", rating.summary);
      const { data: saved, error: saveError } = await q.select("summary").maybeSingle();
      if (saveError || !saved) return json({ error: "保存失败或总结已被修改，请重新读取后重试" }, 409);
      if (saved.summary !== next) return json({ error: "保存回读未确认，请查看学生档案，不要重复提交" }, 500);
      ratingId = rating.id;
    }
    if (input.items.length) {
      const { data: existing } = await client.from("progress_items").select("sort_order").eq("rating_id", ratingId).order("sort_order", { ascending: false }).limit(1);
      const start = (existing?.[0]?.sort_order ?? -1) + 1;
      const { error: itemError } = await client.from("progress_items").insert(input.items.map((it, i) => ({ ...it, rating_id: ratingId, sort_order: start + i, created_by: uid })));
      if (itemError) return json({ error: "纪要和评分已保存，但授课进度保存失败，请到学生档案补填" }, 500);
    }
    const created = rating ? "" : "（已新建课堂评分）";
    return json({ saved: true, message: `已存入 ${lesson.date} ${lesson.time} ${lesson.name} 的课堂总结${created}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "读取或保存失败" }, 500);
  }
}
