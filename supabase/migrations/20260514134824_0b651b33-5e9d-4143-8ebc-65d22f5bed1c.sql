ALTER TABLE public.students
  ADD COLUMN knowledge_updated_at TIMESTAMPTZ,
  ADD COLUMN thinking_updated_at TIMESTAMPTZ,
  ADD COLUMN learning_quality_updated_at TIMESTAMPTZ;