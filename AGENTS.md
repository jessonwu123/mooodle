# Architecture decisions

- Mathematics knowledge tags use a self-referencing nullable `parent_id` and support exactly two levels, preserving existing tags as top-level tags while allowing shared filtering across question-bank workflows.
- Teacher homework and parent practice downloads share HomeworkBuilder so selection, ordering, screenshot preference and answer rendering stay consistent; parent data and image access must use authenticated student-scoped download functions with folder download permissions, while calculations retain the existing shared student access.
- Downloadable PDFs are prepared before a separate synchronous download action so browser downloads and mobile file sharing retain user activation.
- Practice mistake analysis reads authenticated saved-session answers, streams through a server route, and atomically claims a durable account/day quota with session idempotency; this prevents forged results, duplicate billing and concurrent quota overruns.