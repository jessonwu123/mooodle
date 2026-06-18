ALTER TABLE public.student_learning_analytics
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_content text,
  ADD COLUMN IF NOT EXISTS published_chart_data jsonb;