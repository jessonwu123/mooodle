import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateInviteCode, isValidInviteCode, LIMITED_HINT_DAILY, LIMITED_ERROR_PREFIX, UPGRADE_MESSAGE } from "./student-access-rules";
import { isMethodOnlyHint } from "./practice-hint";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function hasRole(ctx: { supabase: any; userId: string }, role: "admin" | "teacher") {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
  return !!data;
}

async function createUniqueCode(admin: any, userId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateInviteCode();
    const { error } = await admin.from("teacher_invite_codes").upsert({ user_id: userId, code, created_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (!error) return code;
    if (error.code !== "23505") throw new Error("生成邀请码失败");
  }
  throw new Error("生成邀请码失败，请重试");
}

/** Teacher: get (or create) own invite code. */
export const getMyInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasRole(context, "teacher")) && !(await hasRole(context, "admin"))) throw new Error("仅教师可查看邀请码");
    const admin = await getAdmin();
    const { data } = await admin.from("teacher_invite_codes").select("code").eq("user_id", context.userId).maybeSingle();
    if (data?.code) return { code: data.code as string };
    return { code: await createUniqueCode(admin, context.userId) };
  });

export const regenerateMyInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasRole(context, "teacher")) && !(await hasRole(context, "admin"))) throw new Error("仅教师可生成邀请码");
    const admin = await getAdmin();
    return { code: await createUniqueCode(admin, context.userId) };
  });

/** Public: register a teacher account with a valid invite code. */
export const registerTeacherAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(6).max(72), inviteCode: z.string().trim() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (!isValidInviteCode(data.inviteCode)) throw new Error("邀请码应为 6 位数字");
    const admin = await getAdmin();
    const { data: invite } = await admin.from("teacher_invite_codes").select("user_id").eq("code", data.inviteCode).maybeSingle();
    if (!invite) throw new Error("邀请码无效");
    const email = data.username.includes("@") ? data.username.toLowerCase() : `${data.username.toLowerCase()}@teacher.local`;
    if (email.endsWith("@student.local")) throw new Error("用户名不合法");
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: data.password, email_confirm: true });
    if (error || !created.user) {
      const msg = error?.message ?? "";
      throw new Error(/already|registered|exists/i.test(msg) ? "该用户名已被注册" : "注册失败，请稍后重试");
    }
    const { error: iErr } = await admin.from("teacher_invitations").insert({ invitee_user_id: created.user.id, inviter_user_id: invite.user_id, invite_code: data.inviteCode });
    if (iErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw new Error("注册失败，请稍后重试");
    }
    return { email };
  });

/** Admin: who invited each teacher. */
export const listTeacherInviters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasRole(context, "admin"))) return [] as Array<{ invitee_user_id: string; inviter_email: string | null; invite_code: string }>;
    const admin = await getAdmin();
    const { data } = await admin.from("teacher_invitations").select("invitee_user_id, inviter_user_id, invite_code");
    const out: Array<{ invitee_user_id: string; inviter_email: string | null; invite_code: string }> = [];
    const cache = new Map<string, string | null>();
    for (const r of data ?? []) {
      if (!cache.has(r.inviter_user_id)) {
        const { data: u } = await admin.auth.admin.getUserById(r.inviter_user_id);
        cache.set(r.inviter_user_id, u?.user?.email ?? null);
      }
      out.push({ invitee_user_id: r.invitee_user_id, inviter_email: cache.get(r.inviter_user_id) ?? null, invite_code: r.invite_code });
    }
    return out;
  });

/** Admin: change a student's access level. */
export const setStudentAccessLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid(), level: z.enum(["full", "limited"]) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await hasRole(context, "admin"))) throw new Error("仅管理员可修改权限");
    const admin = await getAdmin();
    const { error } = await admin.from("students").update({ access_level: data.level }).eq("id", data.studentId);
    if (error) throw new Error("修改失败");
    return { ok: true };
  });

/** Student page: access info for the current viewer. */
export const getStudentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { studentAccessForCaller } = await import("./student-access.server");
    const access = await studentAccessForCaller(data.studentId, context.userId);
    return { limited: access.limited, hintLimit: LIMITED_HINT_DAILY, message: UPGRADE_MESSAGE };
  });

/** Limited students reveal hints one by one, at most 10 distinct questions per Beijing day. */
export const revealPracticeHint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid(), questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { studentAccessForCaller } = await import("./student-access.server");
    const access = await studentAccessForCaller(data.studentId, context.userId);
    if (!access.exists) throw new Error("学生不存在");
    if (!access.isOwner && !(await hasRole(context, "teacher")) && !(await hasRole(context, "admin"))) throw new Error("无权访问");
    const admin = await getAdmin();
    const { data: q } = await admin.from("math_questions").select("practice_hint").eq("id", data.questionId).maybeSingle();
    const hint = q?.practice_hint && isMethodOnlyHint(q.practice_hint) ? q.practice_hint : null;
    if (!hint) throw new Error("该题暂无提示");
    if (access.limited) {
      const { data: ok, error } = await admin.rpc("claim_practice_hint_view", { p_user_id: context.userId, p_question_id: data.questionId, p_limit: LIMITED_HINT_DAILY });
      if (error) throw new Error("提示暂不可用");
      if (!ok) throw new Error(`${LIMITED_ERROR_PREFIX}今日 ${LIMITED_HINT_DAILY} 道题的提示次数已用完。${UPGRADE_MESSAGE}`);
    }
    return { hint };
  });
