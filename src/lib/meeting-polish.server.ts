import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createResponsesCall } from "./ai/responses.server.ts";
import { getLovableAiGatewayResponseHeaders } from "./ai/run-id.server.ts";
import { canPolishMeeting, validateMeetingPolishText, validateMeetingPolishLanguage, validateMeetingPolishImages, validateMeetingPolishTranscript, withMeetingPolishLanguage, meetingPolishInstructions, meetingPolishTranscriptNote, TRANSCRIPT_FILTER_MIN_LENGTH } from "./meeting-polish";
import { filterMeetingTranscript } from "./ai/transcript-filter.server";

export const meetingPolishCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
export async function handleMeetingPolish(request: Request): Promise<Response> {
  const json = (error: string, status: number) => Response.json({ error }, { status, headers: { ...meetingPolishCors, "Cache-Control": "no-store" } });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token) return json("请先登录教师账号", 401);
  if (!url || !key) return json("登录服务配置不完整", 503);
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return json("登录已失效，请重新登录", 401);
  const { data: roles, error: roleError } = await client.from("user_roles").select("role").eq("user_id", auth.user.id);
  if (roleError) return json("教师权限读取失败", 503);
  if (!canPolishMeeting((roles || []).map(r => r.role))) return json("仅教师和管理员可生成课堂反馈", 403);
  let text: string;
  let transcript: string;
  let language: "zh" | "en";
  let images: string[];
  try { const body = await request.json(); text = validateMeetingPolishText(body?.text); transcript = validateMeetingPolishTranscript(body?.transcript); language = validateMeetingPolishLanguage(body?.language); images = validateMeetingPolishImages(body?.images); }
  catch (error) { return json(error instanceof Error ? error.message : "请检查纪要内容", 400); }
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data: blocked, error: stateError } = await admin.from("practice_ai_access_state").select("message,status").eq("id", "gateway").maybeSingle();
  if (stateError) return json("AI 服务状态读取失败", 503);
  if (blocked) return json(blocked.message, blocked.status);
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return json("AI 服务尚未配置", 503);
  const persistBlock = async (status: number, message: string) => {
    if (status === 402 || status === 403) await admin.from("practice_ai_access_state").upsert({ id: "gateway", status, message });
  };
  // 长逐字稿先经低成本模型剔除无关内容，降低主模型输入成本；过滤失败时回退原逐字稿
  let effectiveTranscript = transcript;
  if (transcript.length >= TRANSCRIPT_FILTER_MIN_LENGTH) {
    const filtered = await filterMeetingTranscript(apiKey, transcript, { actorId: auth.user.id, feature: "meeting_feedback_filter" });
    if (filtered && "blocked" in filtered) {
      await persistBlock(filtered.blocked.status, filtered.blocked.message);
      return json(filtered.blocked.message, filtered.blocked.status);
    }
    if (filtered && "text" in filtered) effectiveTranscript = filtered.text;
  }
  const imageNote = images.length
    ? `\n随附 ${images.length} 张课堂笔记图片，包含本节课讲解的题目、解题思路与过程。纪要转写可能省略或误记算式与图形条件，提炼时应结合图片中的原题与板书核对条件、算式与结果；只有题目或圈选答案而无解题过程的图片内容应省略，反馈正文不展示具体案例；纪要与图片冲突时以图片为准，但仍不得编造两者都没有的课堂事实。`
    : "";
  const transcriptNote = transcript ? meetingPolishTranscriptNote : "";
  const userText = effectiveTranscript ? `【会议纪要】\n${text}\n\n【课堂发言逐字稿（语音转写）】\n${effectiveTranscript}` : text;
  const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [
    { type: "text", text: userText },
    ...images.map((image) => ({ type: "image" as const, image: new URL(image) })),
  ];
  const call = createResponsesCall(request, { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" }, [{ role: "user", content: userContent }], withMeetingPolishLanguage(meetingPolishInstructions, language) + imageNote + transcriptNote, { actorId: auth.user.id, feature: "meeting_feedback" });
  const upstream = await call.upstream;
  const safeError = (body: { message?: string; error?: { message?: string } }) => body.message || body.error?.message || "AI 生成未完成，原纪要已保留";
  if (upstream && !upstream.ok) {
    const message = safeError(await upstream.json().catch(() => ({})));
    await persistBlock(upstream.status, message);
    await Promise.resolve(call.result.text).catch(() => "");
    return json(message, upstream.status);
  }
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      let content = "";
      try {
        send({ type: "start", runId: call.getRunId() });
        for await (const part of call.result.fullStream) {
          if (part.type === "text-delta") { content += part.text; send({ type: "text", text: part.text }); }
          if (part.type === "error") throw part.error;
        }
        if (!content.trim()) throw new Error("AI 未返回课堂反馈，原纪要已保留");
        send({ type: "done", runId: call.getRunId() });
      } catch (error) {
        const err = error as { statusCode?: number; responseBody?: string; name?: string; message?: string };
        const status = err.name === "AbortError" ? 499 : err.statusCode || 500;
        let message = status === 499 ? "生成已停止，原纪要已保留" : "AI 生成未完成，原纪要已保留";
        try { message = safeError(JSON.parse(err.responseBody || "{}")); } catch { /* no raw provider detail */ }
        if (err.message?.startsWith("AI 未返回")) message = err.message;
        await persistBlock(status, message);
        send({ type: "error", message, status });
      } finally { controller.close(); }
    },
  });
  return new Response(body, { headers: getLovableAiGatewayResponseHeaders(upstream?.headers, { ...meetingPolishCors, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-store, no-transform" }) });
}
