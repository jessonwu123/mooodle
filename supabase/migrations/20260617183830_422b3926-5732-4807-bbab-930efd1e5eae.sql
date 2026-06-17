ALTER TABLE public.math_questions
  ADD COLUMN IF NOT EXISTS solution_md_zh text,
  ADD COLUMN IF NOT EXISTS solution_images jsonb NOT NULL DEFAULT '[]'::jsonb;