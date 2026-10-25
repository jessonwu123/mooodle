import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import { createCreditUsageTracker, observeCreditStream, type AiUsageContext } from "./credit-usage.server";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
  usageContext?: AiUsageContext,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  let resolveUpstream: (value: Response | null) => void = () => {};
  const upstream = new Promise<Response | null>((resolve) => { resolveUpstream = resolve; });
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const tracker = usageContext ? await createCreditUsageTracker(usageContext, config.model, config.apiKey) : null;
      try {
        const response = await runIdFetch.fetch(input, init);
        resolveUpstream(new Response(null, { status: response.status, headers: response.headers }));
        if (!tracker) return response;
        await tracker.response(response);
        if (!response.ok) { await tracker.finish(); return response; }
        return observeCreditStream(response, tracker);
      } catch (error) { resolveUpstream(null); await tracker?.finish(error); throw error; }
    },
  });
  const reasoning = config.model !== "openai/chat-latest";
  const result = streamText({
    model: provider.responses(config.model),
    ...(instructions ? { system: instructions } : {}),
    messages,
    maxRetries: 0,
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort: "medium",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  return {
    result,
    upstream,
    getRunId: runIdFetch.getRunId,
    response: () =>
      withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({ sendReasoning: true }), runIdFetch),
  };
}
