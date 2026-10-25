import { creditTeacherFor, estimateCredits, readReportedUsage, type CreditPricing, type ReportedUsage } from "../ai-credit-rules";

// Populated only by an already authenticated/authorized server handler; never accept from request JSON.
export type AiUsageContext = { actorId: string; feature: string };

export async function createCreditUsageTracker(context: AiUsageContext, model: string, apiKey: string) {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const [{ data: student, error: studentError }, { data: user }] = await Promise.all([
    admin.from("students").select("id,name,created_by,account_created_by").eq("auth_user_id", context.actorId).maybeSingle(),
    admin.auth.admin.getUserById(context.actorId),
  ]);
  if (studentError) throw new Error("AI 用量归属读取失败，请稍后重试");
  const actorName = student?.name || user.user?.email || "已删除账号";
  const teacherId = creditTeacherFor(context.actorId, !!student, student?.account_created_by ?? null);
  const { data: row, error } = await admin.from("ai_credit_usage").insert({ actor_user_id: context.actorId, teacher_user_id: teacherId, student_id: student?.id ?? null, actor_kind: student ? "student" : "teacher", actor_name: actorName, feature: context.feature, model }).select("id").single();
  if (error || !row) throw new Error("AI 用量记录暂不可用，请稍后重试");
  let pricing: CreditPricing | null = null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const catalog = await res.json() as { workspace_models?: string; data?: { id: string; pricing: CreditPricing }[] };
      if (!catalog.workspace_models?.startsWith("public_only")) pricing = catalog.data?.find(m => m.id === model)?.pricing ?? null;
    }
  } catch { /* Missing pricing is unknown, never zero. */ }
  let usage: ReportedUsage | null = null;
  let runId: string | null = null;
  let httpStatus: number | null = null;
  let state: "completed" | "failed" | "aborted" | "incomplete" = "incomplete";
  let saved = false;
  return {
    async response(response: Response) {
      runId = response.headers.get("X-Lovable-AIG-Run-ID"); httpStatus = response.status;
      if (!response.ok) state = "failed";
      const { error: updateError } = await admin.from("ai_credit_usage").update({ gateway_run_id: runId, http_status: httpStatus, pricing_snapshot: pricing as never }).eq("id", row.id);
      if (updateError) console.error("AI credit correlation save failed", row.id);
    },
    event(event: { type?: string; response?: { usage?: unknown } }) {
      if (event.response?.usage) usage = readReportedUsage(event.response.usage);
      if (event.type === "response.completed") state = "completed";
      if (event.type === "response.failed" || event.type === "error") state = "failed";
    },
    async finish(error?: unknown) {
      if (saved) return;
      saved = true;
      if (error) state = error instanceof Error && error.name === "AbortError" ? "aborted" : "failed";
      const { error: updateError } = await admin.from("ai_credit_usage").update({ status: state, gateway_run_id: runId, http_status: httpStatus, input_tokens: usage?.input_tokens ?? null, cached_input_tokens: usage?.input_tokens_details?.cached_tokens ?? null, output_tokens: usage?.output_tokens ?? null, estimated_credits: estimateCredits(usage, pricing), pricing_snapshot: pricing as never, finished_at: new Date().toISOString() }).eq("id", row.id);
      if (updateError) console.error("AI credit finalization failed", row.id);
    },
  };
}

// Observe the exact provider SSE without a cloned stream or unbounded background buffering.
export function observeCreditStream(response: Response, tracker: Awaited<ReturnType<typeof createCreditUsageTracker>>) {
  if (!response.body || !response.ok) return response;
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    try { tracker.event(JSON.parse(line.slice(5).trim())); } catch { /* non-JSON DONE marker */ }
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) { buffer += decoder.decode(); consume(buffer.trim()); await tracker.finish(); controller.close(); return; }
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) consume(line.trim());
        controller.enqueue(chunk.value);
      } catch (error) { await tracker.finish(error); controller.error(error); }
    },
    async cancel(reason) { await reader.cancel(reason); await tracker.finish(new DOMException("Stopped", "AbortError")); },
  });
  return new Response(body, { status: response.status, headers: response.headers });
}