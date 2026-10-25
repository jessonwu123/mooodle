// Shared server-only helper: runs a chat-style request on the app's default model
// (openai/gpt-6-astra) through the Lovable AI Gateway Responses API, streamed, and
// returns a chat-completions-shaped Response so existing parsing code keeps working.

import { createCreditUsageTracker, observeCreditStream, type AiUsageContext } from "./credit-usage.server";

export const DEFAULT_AI_MODEL = "openai/gpt-6-astra";

type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMessage = { role: "user" | "system" | "assistant"; content: string | ChatPart[] };

function toInput(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "system" ? "developer" : m.role,
    content:
      typeof m.content === "string"
        ? [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }]
        : m.content.map((p) =>
            p.type === "text"
              ? { type: "input_text", text: p.text }
              : { type: "input_image", image_url: p.image_url.url },
          ),
  }));
}

export async function astraChat(
  apiKey: string,
  opts: { messages: ChatMessage[]; json?: boolean; signal?: AbortSignal; usage: AiUsageContext },
): Promise<Response> {
  const allText = opts.messages
    .flatMap((m) => (typeof m.content === "string" ? [m.content] : m.content.map((p) => (p.type === "text" ? p.text : ""))))
    .join(" ");
  // A bare json_object format is only accepted when the input mentions JSON.
  const useJson = opts.json && /json/i.test(allText);
  const tracker = await createCreditUsageTracker(opts.usage, DEFAULT_AI_MODEL, apiKey);
  let upstream: Response;
  try {
  upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: DEFAULT_AI_MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "medium" },
      input: toInput(opts.messages),
      ...(useJson ? { text: { format: { type: "json_object" } } } : {}),
    }),
  });
  });
  } catch (error) { await tracker.finish(error); throw error; }
  await tracker.response(upstream);
  if (!upstream.ok || !upstream.body) { await tracker.finish(); return upstream; }

  upstream = observeCreditStream(upstream, tracker);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let finish = "stop";
  let failure: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let ev: any;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
      else if (ev.type === "response.incomplete") {
        finish = ev.response?.incomplete_details?.reason === "max_output_tokens" ? "length" : "incomplete";
      } else if (ev.type === "response.failed" || ev.type === "error") {
        failure = ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? "AI 调用失败";
      }
    }
  }
  if (failure && !text) {
    return new Response(JSON.stringify({ error: { message: failure } }), { status: 502 });
  }
  return new Response(
    JSON.stringify({ choices: [{ message: { content: text }, finish_reason: finish }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
