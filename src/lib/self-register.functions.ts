import { createServerFn } from "@tanstack/react-start";

/** 家长(学生)自助注册：创建独立学生档案，不关联任何教师 */
export const registerParentAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => input)
  .handler(async ({ data }) => {
    const username = (data.username ?? "").trim();
    const password = data.password ?? "";
    if (!username || username.length > 50) throw new Error("用户名不合法");
    if (password.length < 6) throw new Error("密码至少 6 位");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: exists } = await supabaseAdmin
      .from("students")
      .select("id")
      .ilike("username", username)
      .limit(1);
    if ((exists ?? []).length > 0) throw new Error("该用户名已被占用");

    const studentId = crypto.randomUUID();
    const email = `s-${studentId.replace(/-/g, "").slice(0, 24)}@student.local`;

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "student", student_id: studentId },
    });
    if (cErr || !created.user) throw new Error("注册失败：" + (cErr?.message ?? "未知"));

    const { error: iErr } = await supabaseAdmin.from("students").insert({
      id: studentId,
      name: username,
      username,
      auth_user_id: created.user.id,
      created_by: null,
    });
    if (iErr) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      } catch {
        /* ignore */
      }
      throw new Error("注册失败：" + iErr.message);
    }

    return { email };
  });
