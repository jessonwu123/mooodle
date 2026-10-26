import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canPolishMeeting } from "./meeting-polish";

async function requireTeacher(supabase: { from: (t: string) => any }, userId: string) {
  const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("教师权限读取失败");
  if (!canPolishMeeting((roles || []).map((r: { role: string }) => r.role))) throw new Error("仅教师和管理员可使用腾讯会议直连");
}

async function readToken(supabase: { from: (t: string) => any }, userId: string): Promise<string> {
  const { data, error } = await supabase.from("teacher_meeting_tokens").select("token").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Token 读取失败");
  if (!data?.token) throw new Error("请先保存腾讯会议 Token");
  return data.token;
}

export const getMeetingMcpTokenStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTeacher(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("teacher_meeting_tokens").select("updated_at").eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error("Token 状态读取失败");
    return { configured: Boolean(data), updatedAt: data?.updated_at ?? null };
  });

export const saveMeetingMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ token: z.string().trim().min(10, "Token 长度不正确").max(200, "Token 长度不正确") }).parse(data))
  .handler(async ({ data, context }) => {
    await requireTeacher(context.supabase, context.userId);
    const { validateMeetingMcpToken } = await import("./tencent-meeting-mcp.server");
    await validateMeetingMcpToken(data.token);
    const { error } = await context.supabase
      .from("teacher_meeting_tokens")
      .upsert({ user_id: context.userId, token: data.token, updated_at: new Date().toISOString() });
    if (error) throw new Error("Token 保存失败");
    return { saved: true };
  });

export const deleteMeetingMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTeacher(context.supabase, context.userId);
    const { error } = await context.supabase.from("teacher_meeting_tokens").delete().eq("user_id", context.userId);
    if (error) throw new Error("Token 删除失败");
    return { deleted: true };
  });

export const listMeetingRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择有效日期") }).parse(data))
  .handler(async ({ data, context }) => {
    await requireTeacher(context.supabase, context.userId);
    const token = await readToken(context.supabase, context.userId);
    const { listMeetingRecordings: list } = await import("./tencent-meeting-mcp.server");
    return { records: await list(token, data.date) };
  });

export const fetchMeetingMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ recordFileId: z.string().trim().min(1).max(100) }).parse(data))
  .handler(async ({ data, context }) => {
    await requireTeacher(context.supabase, context.userId);
    const token = await readToken(context.supabase, context.userId);
    const { fetchMeetingSmartMinutes, fetchMeetingTranscript } = await import("./tencent-meeting-mcp.server");
    const [minutes, transcript] = await Promise.all([
      fetchMeetingSmartMinutes(token, data.recordFileId).catch(() => ""),
      fetchMeetingTranscript(token, data.recordFileId).catch(() => ""),
    ]);
    if (!minutes && !transcript) throw new Error("该录制还没有可用的纪要或逐字稿，请确认会中已开启文字转写和元宝纪要");
    return { minutes, transcript };
  });
