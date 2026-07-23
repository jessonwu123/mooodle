import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_students",
  title: "列出学生",
  description: "教师专用：列出当前教师账户可查看的所有学生（姓名、ID、创建时间）。",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("最多返回条数，默认 50"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "未认证" }], isError: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = ctx.getUserId()!;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleList = (roles ?? []).map((r: any) => r.role);
    if (!roleList.includes("teacher") && !roleList.includes("admin")) {
      return { content: [{ type: "text", text: "仅教师可用" }], isError: true };
    }
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { students: data },
    };
  },
});
