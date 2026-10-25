// Server-only: pre-filters the meeting transcript with a low-cost model
// (google/gemini-2.5-flash-lite, chat completions) to remove off-topic chatter
// before the main gpt-6-astra feedback call, cutting input-token cost.
// Any failure falls back to the original transcript; only gateway 402/403
// blocks are surfaced to the caller.

import { createCreditUsageTracker, type AiUsageContext } from "./credit-usage.server";
import { meetingTranscriptFilterInstructions } from "../meeting-polish";

export const TRANSCRIPT_FILTER_MODEL = "google/gemini-2.5-flash-lite";

export type TranscriptFilterResult =
  | { text: string }
  | { blocked: { status: number; message: string } }
  | null;

export async function filterMeetingTranscript(
  apiKey: string,
  transcript: string,
  usage: AiUsageContext,
): Promise<TranscriptFilterResult> {
  const tracker = await createCreditUsageTracker(usage, TRANSCRIPT_FILTER_MODEL, apiKey);
  let upstream: Response;
  try {
    upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: TRANSCRIPT_FILTER_MODEL,
        stream: true,
        messages: [
          { role: "system", content: meetingTranscriptFilterInstructions },
          { role: "user", content: transcript },
        ],
      }),
    });
  } catch (error) {
    await tracker.finish(error);
    return null;
  }
  await tracker.response(upstream);
  if (!upstream.ok || !upstream.body) {
    await tracker.finish();
    if (upstream.status === 402 || upstream.status === 403) {
      const body = (await upstream.json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
      return { blocked: { status: upstream.status, message: body.message || body.error?.message || "AI 服务暂不可用" } };
    }
    return null;
  }
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let failure: string | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let ev: {
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
          error?: { message?: string };
        };
        try { ev = JSON.parse(payload); } catch { continue; }
        const delta = ev.choices?.[0]?.delta?.content;
        if (typeof delta === "string") text += delta;
        if (ev.usage) {
          tracker.event({
            type: "response.completed",
            response: {
              usage: {
                input_tokens: ev.usage.prompt_tokens ?? 0,
                output_tokens: ev.usage.completion_tokens ?? 0,
                input_tokens_details: { cached_tokens: ev.usage.prompt_tokens_details?.cached_tokens ?? 0 },
              },
            },
          });
        }
        if (ev.error) failure = ev.error.message || "逐字稿过滤失败";
      }
    }
  } catch (error) {
    await tracker.finish(error);
    return null;
  }
  await tracker.finish();
  const trimmed = text.trim();
  // 过滤结果异常（为空、过短或反而更长）时回退原逐字稿
  if (failure || trimmed.length < 50 || trimmed.length >= transcript.length) return null;
  return { text: trimmed };
}
