import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meeting-polish")({
  server: { handlers: {
    OPTIONS: async () => { const { meetingPolishCors } = await import("@/lib/meeting-polish.server"); return new Response(null, { status: 204, headers: meetingPolishCors }); },
    POST: async ({ request }) => { const { handleMeetingPolish } = await import("@/lib/meeting-polish.server"); return handleMeetingPolish(request); },
  } },
});