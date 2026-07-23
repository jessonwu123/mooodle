import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "whoami",
  title: "当前用户身份",
  description: "返回当前通过 OAuth 认证的用户身份、邮箱以及在本应用中的角色（学生/教师/管理员）。",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "未认证" }], isError: true };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userId = ctx.getUserId();
    const [{ data: roles }, { data: student }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin.from("students").select("id, name").eq("auth_user_id", userId).maybeSingle(),
    ]);
    const roleList = (roles ?? []).map((r: any) => r.role);
    const info = {
      user_id: userId,
      email: ctx.getUserEmail(),
      roles: roleList,
      is_admin: roleList.includes("admin"),
      is_teacher: roleList.includes("teacher") || roleList.includes("admin"),
      student: student ? { id: student.id, name: student.name } : null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      structuredContent: info,
    };
  },
});
