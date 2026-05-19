
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS total_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS hours_per_lesson numeric(4,2),
  ADD COLUMN IF NOT EXISTS schedule_start_date date,
  ADD COLUMN IF NOT EXISTS schedule_weekday smallint CHECK (schedule_weekday IS NULL OR (schedule_weekday >= 0 AND schedule_weekday <= 6)),
  ADD COLUMN IF NOT EXISTS schedule_start_time time,
  ADD COLUMN IF NOT EXISTS schedule_end_time time;
