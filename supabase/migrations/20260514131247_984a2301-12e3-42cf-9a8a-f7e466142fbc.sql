ALTER TABLE public.ratings
  ADD COLUMN lesson_name TEXT,
  ADD COLUMN summary TEXT,
  ADD COLUMN overall_assessment SMALLINT CHECK (overall_assessment BETWEEN 1 AND 5);