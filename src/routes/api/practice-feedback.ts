import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/practice-feedback")({
  server: { handlers: { POST: async ({ request }) => {
    const { handlePracticeFeedback } = await import("@/lib/practice-feedback.server");
    return handlePracticeFeedback(request);
  } } },
});