import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/meeting-plugin")({
  server: { handlers: {
    OPTIONS: async () => { const { pluginCors } = await import("@/lib/meeting-plugin.server"); return new Response(null, { status: 204, headers: pluginCors }); },
    POST: async ({ request }) => { const { handleMeetingPlugin } = await import("@/lib/meeting-plugin.server"); return handleMeetingPlugin(request); },
  } },
});
