import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DEFAULT_STUDENT_PASSWORD = "000000";

export function internalEmailFor(studentId: string): string {
  return `s-${studentId.replace(/-/g, "").slice(0, 24)}@student.local`;
}

export async function ensureUniqueUsername(
  base: string,
  excludeStudentId?: string,
): Promise<string> {
  const trimmed = base.trim();
  if (!trimmed) throw new Error("用户名不能为空");
  let candidate = trimmed;
  let i = 1;
  while (i < 50) {
    const { data } = await supabaseAdmin
      .from("students")
      .select("id")
      .ilike("username", candidate);
    const conflict = (data ?? []).filter((r) => r.id !== excludeStudentId);
    if (conflict.length === 0) return candidate;
    i += 1;
    candidate = `${trimmed}${i}`;
  }
  throw new Error("无法生成唯一的用户名");
}

export async function assertTeacher(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const list = (roles ?? []).map((r) => r.role as string);
  const isAdmin = list.includes("admin");
  const isTeacher = isAdmin || list.includes("teacher");
  if (!isTeacher) throw new Error("无权访问");
  return { isAdmin };
}
