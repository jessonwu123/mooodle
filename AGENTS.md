# Architecture decisions

- Mathematics knowledge tags use a self-referencing nullable `parent_id` and support exactly two levels, preserving existing tags as top-level tags while allowing shared filtering across question-bank workflows.