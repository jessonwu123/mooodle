import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_student_recent_lessons",
  title: "获取学生近期课堂记录",
  description:
    "读取指定学生最近若干节课的课堂评分（专注力、互动性、纪律、准确率、整体评价、老师总结、授课知识点吸收百分比）。仅本人或教师/管理员可调用。",
  inputSchema: {
    student_id: z.string().uuid().describe("学生 ID (UUID)"),
    limit: z.number().int().min(1).max(50).optional().describe("返回条数，默认 10"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ student_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "未认证" }], isError: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = ctx.getUserId()!;
    const [{ data: roles }, { data: student }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.from("students").select("id, name, auth_user_id").eq("id", student_id).maybeSingle(),
    ]);
    if (!student) return { content: [{ type: "text", text: "学生不存在" }], isError: true };
    const roleList = (roles ?? []).map((r: any) => r.role);
    const isStaff = roleList.includes("teacher") || roleList.includes("admin");
    const isOwner = student.auth_user_id === userId;
    if (!isStaff && !isOwner) {
      return { content: [{ type: "text", text: "无权访问" }], isError: true };
    }
    const { data, error } = await supabaseAdmin
      .from("ratings")
      .select(
        "lesson_date, lesson_name, summary, overall_assessment, focus, interaction, discipline, accuracy, overall_progress, progress_items(item_name, percentage, sort_order)",
      )
      .eq("student_id", student_id)
      .order("lesson_date", { ascending: false })
      .limit(limit ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const lessons = (data ?? []).map((r: any) => ({
      lesson_date: r.lesson_date,
      lesson_name: r.lesson_name,
      focus: r.focus,
      interaction: r.interaction,
      discipline: r.discipline,
      accuracy: r.accuracy,
      overall: r.overall_assessment,
      overall_progress: r.overall_progress,
      teacher_summary: r.summary,
      progress_items: ((r.progress_items ?? []) as any[])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((p) => ({ item: p.item_name, percentage: p.percentage })),
    }));
    const out = { student: { id: student.id, name: student.name }, lessons };
    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  },
});
