ALTER TABLE public.teacher_org_rates
  ADD COLUMN IF NOT EXISTS base_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_hours numeric NOT NULL DEFAULT 0;