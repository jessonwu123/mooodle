import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_STUDENT_PASSWORD,
  ensureUniqueUsername,
  internalEmailFor,
} from "@/lib/student-account.server";

/** 教师创建/确保某个学生的登录账号 */
export const ensureStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: student, error } = await supabaseAdmin
      .from("students")
      .select("id, name, username, auth_user_id, created_by")
      .eq("id", data.studentId)
      .maybeSingle();
    if (error || !student) throw new Error("学生不存在");
    if (student.created_by !== userId) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      if (!isAdmin) throw new Error("无权操作");
    }
    if (student.auth_user_id && student.username) {
      return { username: student.username, created: false };
    }
    const username = await ensureUniqueUsername(
      student.username || student.name,
      student.id,
    );
    const email = internalEmailFor(student.id);

    let authUserId = student.auth_user_id as string | null;
    if (!authUserId) {
      const { data: created, error: cErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: DEFAULT_STUDENT_PASSWORD,
          email_confirm: true,
          user_metadata: { role: "student", student_id: student.id },
        });
      if (cErr || !created.user) {
        throw new Error("创建登录账号失败：" + (cErr?.message ?? "未知"));
      }
      authUserId = created.user.id;
    }

    const { error: uErr } = await supabaseAdmin
      .from("students")
      .update({ username, auth_user_id: authUserId })
      .eq("id", student.id);
    if (uErr) throw new Error("保存账号失败：" + uErr.message);

    return { username, created: true };
  });

/** 学生本人修改用户名 */
export const updateStudentUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { newUsername: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const newUsername = data.newUsername.trim();
    if (!newUsername) throw new Error("用户名不能为空");
    if (newUsername.length > 50) throw new Error("用户名过长");
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, username")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!student) throw new Error("未找到对应学生档案");
    const unique = await ensureUniqueUsername(newUsername, student.id);
    if (unique !== newUsername) throw new Error("该用户名已被占用");
    const { error } = await supabaseAdmin
      .from("students")
      .update({ username: newUsername })
      .eq("id", student.id);
    if (error) throw new Error("修改失败：" + error.message);
    return { username: newUsername };
  });

/** 学生本人修改密码 */
export const updateStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { newPassword: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const pwd = data.newPassword;
    if (!pwd || pwd.length < 6) throw new Error("密码至少 6 位");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: pwd,
    });
    if (error) throw new Error("修改密码失败：" + error.message);
    return { ok: true };
  });
