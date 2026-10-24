import { isRestricted } from "./student-access-rules";

/** Returns whether the caller is this student's own account and whether that account is limited. */
export async function studentAccessForCaller(studentId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("students")
    .select("auth_user_id, access_level")
    .eq("id", studentId)
    .maybeSingle();
  const isOwner = !!data?.auth_user_id && data.auth_user_id === userId;
  return { exists: !!data, isOwner, limited: isRestricted(data?.access_level, isOwner) };
}
