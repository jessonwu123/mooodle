ALTER TABLE public.cancelled_lessons ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE public.cancelled_lessons ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'leave';