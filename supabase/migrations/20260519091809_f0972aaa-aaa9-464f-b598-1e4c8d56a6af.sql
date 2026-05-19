-- Add hourly_rate to students table for per-student lesson fee calculation
ALTER TABLE public.students
ADD COLUMN hourly_rate numeric NULL;

COMMENT ON COLUMN public.students.hourly_rate IS '课时费：每小时多少钱';