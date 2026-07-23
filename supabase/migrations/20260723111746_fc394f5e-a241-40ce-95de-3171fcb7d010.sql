
CREATE TABLE public.imported_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  class_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX imported_lessons_created_by_date_idx
  ON public.imported_lessons(created_by, lesson_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_lessons TO authenticated;
GRANT ALL ON public.imported_lessons TO service_role;

ALTER TABLE public.imported_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own imported lessons"
  ON public.imported_lessons
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins view all imported lessons"
  ON public.imported_lessons
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
