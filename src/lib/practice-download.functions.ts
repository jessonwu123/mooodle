import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { canDownloadFolder } from "./practice-download-rules";

async function downloadCatalog(context: { supabase: any; userId: string }, studentId: string) {
  const [mine, adminRole, teacherRole] = await Promise.all([
    context.supabase.rpc("get_my_student_profile"),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "teacher" }),
  ]);
  const isOwner = Array.isArray(mine.data) && mine.data.some((row: { id: string }) => row.id === studentId);
  if (!isOwner && !adminRole.data && !teacherRole.data) throw new Error("无权访问该学生的练习");
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data: student, error: studentError } = await admin.from("students").select("id").eq("id", studentId).maybeSingle();
  if (studentError || !student) throw new Error("学生不存在");
  const { data: folders, error } = await admin.rpc("list_student_accessible_folders", { _student_id: studentId });
  if (error) throw new Error(error.message);
  const folderIds = (folders ?? []).filter((row: any) => canDownloadFolder(row.level, row.is_ancestor)).map((row: any) => row.folder_id);
  const papers: any[] = [];
  if (folderIds.length) {
    for (let from = 0; ; from += 1000) {
      const result = await admin.from("math_papers").select("id, year, name, kind, pdf_path, question_count").in("folder_id", folderIds).eq("kind", "paper").order("id").range(from, from + 999);
      if (result.error) throw new Error(result.error.message);
      papers.push(...(result.data ?? []));
      if ((result.data ?? []).length < 1000) break;
    }
  }
  const questions: any[] = [];
  // Calculations remain shared with all student accounts, like online calculation practice.
  for (let from = 0; ; from += 1000) {
    const result = await admin.from("math_questions").select("id, paper_id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, image_path, options_image_path, answer_type").eq("answer_type", "计算").order("id").range(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    questions.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) break;
  }
  for (let i = 0; i < papers.length; i += 100) {
    for (let from = 0; ; from += 1000) {
      const result = await admin.from("math_questions").select("id, paper_id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, image_path, options_image_path, answer_type").in("paper_id", papers.slice(i, i + 100).map((p) => p.id)).order("id").range(from, from + 999);
      if (result.error) throw new Error(result.error.message);
      questions.push(...(result.data ?? []));
      if ((result.data ?? []).length < 1000) break;
    }
  }
  const unique = [...new Map(questions.map((q) => [q.id, q])).values()];
  const links: Array<{ question_id: string; tag_id: string }> = [];
  for (let i = 0; i < unique.length; i += 200) {
    for (let from = 0; ; from += 1000) {
      const result = await admin.from("math_question_tags").select("id, question_id, tag_id").in("question_id", unique.slice(i, i + 200).map((q) => q.id)).order("id").range(from, from + 999);
      if (result.error) throw new Error(result.error.message);
      links.push(...(result.data ?? []));
      if ((result.data ?? []).length < 1000) break;
    }
  }
  const tagResult = await admin.from("math_tags").select("id, name, category, parent_id").order("name");
  if (tagResult.error) throw new Error(tagResult.error.message);
  const used = new Set(links.map((r) => r.tag_id));
  for (const tag of tagResult.data ?? []) if (used.has(tag.id) && tag.parent_id) used.add(tag.parent_id);
  return { admin, papers, questions: unique, links, tags: (tagResult.data ?? []).filter((t: any) => used.has(t.id)) };
}

export const listPracticeDownloads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin: _admin, ...catalog } = await downloadCatalog(context, data.studentId);
    return catalog;
  });

export const preparePracticeDownloadImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid(), questionIds: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const catalog = await downloadCatalog(context, data.studentId);
    const byId = new Map(catalog.questions.map((q) => [q.id, q]));
    if (data.questionIds.some((id) => !byId.has(id))) throw new Error("题目已删除或没有下载权限，请刷新后重新选择");
    const paths = [...new Set(data.questionIds.flatMap((id) => {
      const q = byId.get(id);
      return [q?.image_path, q?.options_image_path].filter((p): p is string => typeof p === "string" && p.length > 0);
    }))];
    if (!paths.length) return { urls: {} as Record<string, string> };
    const { data: signed, error } = await catalog.admin.storage.from("math-question-images").createSignedUrls(paths, 600);
    if (error) throw new Error(error.message);
    const urls: Record<string, string> = {};
    for (const row of signed ?? []) {
      if (row.error || !row.path || !row.signedUrl) throw new Error("无法读取原题截图");
      urls[row.path] = row.signedUrl;
    }
    return { urls };
  });