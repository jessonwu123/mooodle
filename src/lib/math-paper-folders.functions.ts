import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("仅管理员可执行");
}

export const listMathPaperFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("math_paper_folders")
      .select("id, parent_id, name, created_at")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { folders: data ?? [] };
  });

export const createMathPaperFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        parentId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("math_paper_folders")
      .insert({
        name: data.name,
        parent_id: data.parentId,
        created_by: context.userId,
      })
      .select("id, parent_id, name, created_at")
      .single();
    if (error || !row) throw new Error(error?.message || "创建文件夹失败");
    return { folder: row };
  });

export const renameMathPaperFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_paper_folders")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMathPaperFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Move papers in this folder up to parent (or root)
    const { data: folder } = await context.supabase
      .from("math_paper_folders")
      .select("parent_id")
      .eq("id", data.id)
      .single();
    const parentId = folder?.parent_id ?? null;
    await context.supabase
      .from("math_papers")
      .update({ folder_id: parentId })
      .eq("folder_id", data.id);
    const { error } = await context.supabase
      .from("math_paper_folders")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Batch upload: create math_papers rows for already-uploaded PDF storage paths
export const createMathPaperFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        folderId: z.string().uuid().nullable(),
        kind: z.enum(["paper", "answer"]),
        files: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              pdfPath: z.string().min(1),
              year: z.number().int().min(1900).max(2100).nullable(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows = data.files.map((f) => ({
      folder_id: data.folderId,
      kind: data.kind,
      name: f.name,
      pdf_path: f.pdfPath,
      year: f.year,
      question_count: 0,
      uploaded_by: context.userId,
    }));
    const { data: inserted, error } = await context.supabase
      .from("math_papers")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, count: inserted?.length ?? 0 };
  });

export const listMathPapersInFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ folderId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const q = context.supabase
      .from("math_papers")
      .select("id, year, name, question_count, created_at, kind, folder_id")
      .order("created_at", { ascending: false });
    const { data: rows, error } = data.folderId
      ? await q.eq("folder_id", data.folderId)
      : await q.is("folder_id", null);
    if (error) throw new Error(error.message);
    return { papers: rows ?? [] };
  });

export const moveMathPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ paperId: z.string().uuid(), folderId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("math_papers")
      .update({ folder_id: data.folderId })
      .eq("id", data.paperId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
