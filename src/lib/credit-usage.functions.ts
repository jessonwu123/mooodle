import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const range = z.object({ from: z.string().datetime(), to: z.string().datetime() }).refine(d => Date.parse(d.to) > Date.parse(d.from) && Date.parse(d.to) - Date.parse(d.from) <= 366 * 86400000, "日期范围无效（最多366天）");
export type CreditSummary = {
  teachers: { teacher_user_id: string | null; teacher_name: string; teacher_email: string | null; requests: number; unknown_requests: number; credits: number; teacher_credits: number; student_credits: number }[];
  actors: { teacher_user_id: string | null; actor_user_id: string; actor_kind: string; actor_name: string; requests: number; unknown_requests: number; credits: number }[];
  features: { teacher_user_id: string | null; feature: string; requests: number; unknown_requests: number; credits: number }[];
  recording_since: string | null;
};

export const getCreditSummary = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => range.parse(d)).handler(async ({ data, context }) => {
  const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (roleError || !isAdmin) throw new Error("仅管理员可查看 credits 用量");
  const { data: summary, error } = await context.supabase.rpc("ai_credit_usage_summary", { p_from: data.from, p_to: data.to });
  if (error) throw new Error("用量汇总读取失败");
  return summary as unknown as CreditSummary;
});

export const getCreditDetails = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => range.and(z.object({ teacherId: z.string().uuid().nullable(), page: z.number().int().min(0).max(10000).default(0), actorId: z.string().uuid().optional(), feature: z.string().max(80).optional() })).parse(d)).handler(async ({ data, context }) => {
  const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (roleError || !isAdmin) throw new Error("仅管理员可查看 credits 明细");
  let query = context.supabase.from("ai_credit_usage").select("id,actor_name,actor_kind,feature,model,status,input_tokens,cached_input_tokens,output_tokens,estimated_credits,started_at,gateway_run_id", { count: "exact" }).gte("started_at", data.from).lt("started_at", data.to);
  query = data.teacherId ? query.eq("teacher_user_id", data.teacherId) : query.is("teacher_user_id", null);
  if (data.actorId) query = query.eq("actor_user_id", data.actorId);
  if (data.feature) query = query.eq("feature", data.feature);
  const { data: rows, count, error } = await query.order("started_at", { ascending: false }).order("id").range(data.page * 50, data.page * 50 + 49);
  if (error) throw new Error("用量明细读取失败");
  return { rows: rows ?? [], count: count ?? 0 };
});