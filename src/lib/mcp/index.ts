import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listStudentsTool from "./tools/list-students";
import getStudentRecentLessonsTool from "./tools/get-student-recent-lessons";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "classroom-archive-mcp",
  title: "课堂档案 MCP",
  version: "0.1.0",
  instructions:
    "用于访问课堂档案系统的工具集。可查询当前用户身份、教师可列出学生并读取学生的近期课堂表现。所有工具受 OAuth 保护并遵循应用内权限。",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listStudentsTool, getStudentRecentLessonsTool],
});
