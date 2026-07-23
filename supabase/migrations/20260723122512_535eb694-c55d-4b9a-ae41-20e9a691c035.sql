
-- Add teacher_name column for student-added lessons
ALTER TABLE public.single_lessons ADD COLUMN IF NOT EXISTS teacher_name text;

-- Allow students to view all their own recurring cancellations already covered by existing policy.
-- Ensure students can insert cancellations only for their own row via existing policy (already permissive).

-- Extend the profile RPC to also expose schedule fields to the student themselves.
DROP FUNCTION IF EXISTS public.get_my_student_profile();
CREATE OR REPLACE FUNCTION public.get_my_student_profile()
RETURNS TABLE(
  id uuid,
  name text,
  username text,
  auth_user_id uuid,
  knowledge_updated_at timestamp with time zone,
  thinking_updated_at timestamp with time zone,
  learning_quality_updated_at timestamp with time zone,
  created_by uuid,
  total_hours numeric,
  hours_per_lesson numeric,
  hourly_rate numeric,
  schedule_start_date date,
  schedule_slots jsonb,
  schedule_frequency_weeks integer,
  schedule_weekday integer,
  schedule_start_time time without time zone,
  schedule_end_time time without time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.username, s.auth_user_id,
         s.knowledge_updated_at, s.thinking_updated_at, s.learning_quality_updated_at,
         s.created_by,
         s.total_hours, s.hours_per_lesson, s.hourly_rate,
         s.schedule_start_date, s.schedule_slots, s.schedule_frequency_weeks,
         s.schedule_weekday, s.schedule_start_time, s.schedule_end_time
  FROM public.students s
  WHERE s.auth_user_id = auth.uid()
  LIMIT 1;
$function$;
