import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fetchMeetingSessions } from "@/lib/meeting-sessions";
import { mergeMeetingNotes } from "@/lib/meeting-notes";

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
  let body: { action?: string; date?: string; sessionId?: string; text?: string };
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
    const { data: rating, error } = await client.from("ratings").select("id,summary").eq("student_id", lesson.studentId).eq("lesson_date", lesson.date).maybeSingle();
    if (error) throw error;
    if (!rating) return json({ error: "该课节还没有课堂评分，请先在学生档案中评分后再存档" }, 409);
    const next = mergeMeetingNotes(rating.summary || "", mergeMeetingNotes("", text, "replace"), "append");
    let q = client.from("ratings").update({ summary: next }).eq("id", rating.id);
    q = rating.summary === null ? q.is("summary", null) : q.eq("summary", rating.summary);
    const { data: saved, error: saveError } = await q.select("summary").maybeSingle();
    if (saveError || !saved) return json({ error: "保存失败或总结已被修改，请重新读取后重试" }, 409);
    if (saved.summary !== next) return json({ error: "保存回读未确认，请查看学生档案，不要重复提交" }, 500);
    return json({ saved: true, message: `已存入 ${lesson.date} ${lesson.time} ${lesson.name} 的课堂总结` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "读取或保存失败" }, 500);
  }
}
