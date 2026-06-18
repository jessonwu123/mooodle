import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LEVELS = ["none", "read", "download", "upload", "manage"] as const;
export type FolderPermLevel = (typeof LEVELS)[number];

async function assertAdmin(ctx: { supabase: { rpc: (...a: never[]) => unknown }; userId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ok } = await (ctx.supabase as any).rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!ok) throw new Error("仅管理员可执行");
}

// --- Admin: 管理某文件夹的权限 ---
export const listFolderOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ folderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).rpc(
      "list_folder_permission_overrides",
      { _folder_id: data.folderId },
    );
    if (error) throw new Error(error.message);
    return { overrides: (rows ?? []) as Array<{
      id: string;
      subject_type: "teacher" | "student";
      subject_id: string;
      level: FolderPermLevel;
      display_name: string | null;
    }> };
  });

export const setFolderPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        folderId: z.string().uuid(),
        subjectType: z.enum(["teacher", "student"]),
        subjectId: z.string().uuid(),
        level: z.enum(LEVELS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_paper_folder_permissions")
      .upsert(
        {
          folder_id: data.folderId,
          subject_type: data.subjectType,
          subject_id: data.subjectId,
          level: data.level,
        },
        { onConflict: "folder_id,subject_type,subject_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFolderPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_paper_folder_permissions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin only — 列出全部老师/学生用于授权选择
export const listSubjectsForPermission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: teachers } = await (context.supabase as any).rpc("list_all_teachers");
    const { data: students } = await context.supabase
      .from("students")
      .select("id, name")
      .order("name", { ascending: true });
    return {
      teachers: ((teachers ?? []) as Array<{
        user_id: string;
        email: string | null;
        is_admin: boolean;
        is_teacher: boolean;
      }>)
        .filter((t) => t.is_teacher && !t.is_admin)
        .map((t) => ({ id: t.user_id, email: t.email })),
      students: (students ?? []) as Array<{ id: string; name: string }>,
    };
  });

// --- 家长端 / 学生端：获取自己可见的资料库 ---
export const getStudentLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        studentId: z.string().uuid(),
        folderId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // 学生表已收紧 RLS：用 admin client 读取学生身份信息以做归属校验
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [studentRes, adminRes, teacherRes] = await Promise.all([
      supabaseAdmin
        .from("students")
        .select("id, auth_user_id, name")
        .eq("id", data.studentId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("has_role", { _user_id: userId, _role: "admin" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("has_role", { _user_id: userId, _role: "teacher" }),
    ]);
    const student = studentRes.data as { id: string; auth_user_id: string | null; name: string } | null;
    if (!student) throw new Error("学生不存在");
    const isOwner = !!student.auth_user_id && student.auth_user_id === userId;
    const isAdmin = !!adminRes.data;
    const isTeacher = !!teacherRes.data;
    if (!isOwner && !isAdmin && !isTeacher) throw new Error("无权访问");


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accessible, error } = await (supabase as any).rpc(
      "list_student_accessible_folders",
      { _student_id: data.studentId },
    );
    if (error) throw new Error(error.message);
    type Row = {
      folder_id: string;
      parent_id: string | null;
      name: string;
      level: FolderPermLevel;
      is_ancestor: boolean;
    };
    const allFolders = ((accessible ?? []) as Row[]).map((r) => ({
      id: r.folder_id,
      parent_id: r.parent_id,
      name: r.name,
      level: r.level,
      is_ancestor: r.is_ancestor,
    }));

    const subfolders = allFolders.filter((f) => f.parent_id === data.folderId);

    // 当前文件夹有效权限
    let currentLevel: FolderPermLevel = "none";
    if (data.folderId === null) {
      // 根目录视作可浏览(只列子目录)，不展示根级 papers
      currentLevel = "read";
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lvl } = await (supabase as any).rpc("get_effective_folder_permission", {
        _folder_id: data.folderId,
        _subject_type: "student",
        _subject_id: data.studentId,
      });
      currentLevel = ((lvl as string) ?? "none") as FolderPermLevel;
    }

    // 当前文件夹仅作为祖先(level=none)时，仍允许列出子目录，但不返回 papers
    let papers: Array<{
      id: string;
      year: number | null;
      name: string;
      kind: "paper" | "answer";
      created_at: string;
      question_count: number;
    }> = [];
    if (currentLevel !== "none" && data.folderId !== null) {
      // math_papers RLS doesn't grant student SELECT; use admin client since
      // we've already verified folder-level access above.
      const { data: ps, error: e2 } = await supabaseAdmin
        .from("math_papers")
        .select("id, year, name, kind, created_at, question_count")
        .eq("folder_id", data.folderId)
        .order("created_at", { ascending: false });
      if (e2) throw new Error(e2.message);
      papers = (ps ?? []) as typeof papers;
    }

    return { subfolders, papers, currentLevel, studentName: student.name };
  });

// 家长/学生 下载某试卷 PDF —— 服务端检查权限
export const getStudentPaperUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        studentId: z.string().uuid(),
        paperId: z.string().uuid(),
        wantDownload: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // 鉴权
    const [studentRes, adminRes, teacherRes, paperRes] = await Promise.all([
      supabaseAdmin
        .from("students")
        .select("id, auth_user_id")
        .eq("id", data.studentId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("has_role", { _user_id: userId, _role: "admin" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("has_role", { _user_id: userId, _role: "teacher" }),
      supabaseAdmin
        .from("math_papers")
        .select("id, name, pdf_path, folder_id, kind")
        .eq("id", data.paperId)
        .maybeSingle(),
    ]);

    const student = studentRes.data as { id: string; auth_user_id: string | null } | null;
    const paper = paperRes.data as {
      id: string;
      name: string;
      pdf_path: string | null;
      folder_id: string | null;
      kind: "paper" | "answer";
    } | null;
    if (!student) throw new Error("学生不存在");
    if (!paper || !paper.pdf_path) throw new Error("文件不存在");

    const isOwner = !!student.auth_user_id && student.auth_user_id === userId;
    const isAdmin = !!adminRes.data;
    const isTeacher = !!teacherRes.data;

    if (!isAdmin && !isTeacher) {
      // 必须是学生本人，且对该文件夹有 read/download 权限
      if (!isOwner) throw new Error("无权访问");
      if (!paper.folder_id) throw new Error("该文件未授权访问");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lvl } = await (supabase as any).rpc("get_effective_folder_permission", {
        _folder_id: paper.folder_id,
        _subject_type: "student",
        _subject_id: data.studentId,
      });
      const level = ((lvl as string) ?? "none") as FolderPermLevel;
      if (level === "none") throw new Error("无权访问");
      const order: Record<FolderPermLevel, number> = {
        none: 0, read: 1, download: 2, upload: 3, manage: 4,
      };
      if (data.wantDownload && order[level] < order.download) {
        throw new Error("您没有下载该文件的权限");
      }
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from("math-papers")
      .createSignedUrl(paper.pdf_path, 60 * 30);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "生成下载链接失败");
    return { name: paper.name, url: signed.signedUrl, kind: paper.kind };
  });
