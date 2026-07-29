import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  xngjLogin,
  xngjFetchLessons,
  computeSyncWindow,
  lessonKey,
  type XngjLesson,
} from "./xngj.server";

export interface SyncDiffRow {
  id?: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  class_name: string;
}

export interface SyncResult {
  added: SyncDiffRow[];
  deleted: SyncDiffRow[];
  keptCount: number;
  startDate: string;
  endDate: string;
}

export const getXngjCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("teacher_xngj_credentials")
      .select("username")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { configured: !!data, username: data?.username ?? null };
  });

export const saveXngjCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string; password: string }) =>
    z
      .object({
        username: z.string().trim().min(1, "请输入用户名").max(100),
        password: z.string().min(1, "请输入密码").max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Validate against xngj before persisting.
    const login = await xngjLogin(data.username, data.password);
    const { error } = await context.supabase
      .from("teacher_xngj_credentials")
      .upsert(
        {
          user_id: context.userId,
          username: data.username,
          password: data.password,
          xngj_user_id: login.userId,
          tenant_name: "犀牛教育",
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runXngjSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult> => {
    const { data: cred, error: credErr } = await context.supabase
      .from("teacher_xngj_credentials")
      .select("username, password, xngj_user_id, tenant_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (credErr) throw new Error(credErr.message);
    if (!cred) throw new Error("请先绑定灵犀 CRM 账号");

    const login = await xngjLogin(
      cred.username,
      cred.password,
      cred.tenant_name || "犀牛教育",
    );
    if (login.userId !== cred.xngj_user_id) {
      await context.supabase
        .from("teacher_xngj_credentials")
        .update({ xngj_user_id: login.userId })
        .eq("user_id", context.userId);
    }

    const { startDate, endDate } = computeSyncWindow();
    const remote: XngjLesson[] = await xngjFetchLessons(
      login.accessToken,
      login.userId,
      startDate,
      endDate,
    );

    const { data: localRows, error: localErr } = await context.supabase
      .from("imported_lessons")
      .select("id, lesson_date, start_time, end_time, class_name")
      .eq("created_by", context.userId)
      .gte("lesson_date", startDate)
      .lte("lesson_date", endDate);
    if (localErr) throw new Error(localErr.message);

    const remoteMap = new Map<string, XngjLesson>();
    for (const r of remote) remoteMap.set(lessonKey(r), r);

    const localMap = new Map<
      string,
      { id: string; lesson_date: string; start_time: string; end_time: string; class_name: string }
    >();
    for (const l of localRows ?? []) {
      // Normalize local times to HH:mm:ss to match remote.
      const norm = {
        ...l,
        start_time: l.start_time.length === 5 ? `${l.start_time}:00` : l.start_time,
        end_time: l.end_time.length === 5 ? `${l.end_time}:00` : l.end_time,
      };
      localMap.set(lessonKey(norm), norm);
    }

    const added: SyncDiffRow[] = [];
    const deleted: SyncDiffRow[] = [];
    let keptCount = 0;
    for (const [k, r] of remoteMap) {
      if (localMap.has(k)) keptCount++;
      else added.push(r);
    }
    for (const [k, l] of localMap) {
      if (!remoteMap.has(k)) deleted.push(l);
    }

    if (deleted.length > 0) {
      const ids = deleted.map((d) => d.id!).filter(Boolean);
      const { error } = await context.supabase
        .from("imported_lessons")
        .delete()
        .in("id", ids);
      if (error) throw new Error("删除课次失败：" + error.message);
    }
    if (added.length > 0) {
      const rows = added.map((a) => ({
        created_by: context.userId,
        lesson_date: a.lesson_date,
        start_time: a.start_time,
        end_time: a.end_time,
        class_name: a.class_name,
      }));
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await context.supabase
          .from("imported_lessons")
          .insert(rows.slice(i, i + CHUNK));
        if (error) throw new Error("写入课次失败：" + error.message);
      }
    }

    return { added, deleted, keptCount, startDate, endDate };
  });
