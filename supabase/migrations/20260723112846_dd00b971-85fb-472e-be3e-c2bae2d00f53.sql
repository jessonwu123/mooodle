
CREATE TABLE public.single_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  class_name text,
  lesson_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  hours_per_lesson numeric,
  hourly_rate numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (student_id IS NOT NULL OR (class_name IS NOT NULL AND length(trim(class_name)) > 0))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.single_lessons TO authenticated;
GRANT ALL ON public.single_lessons TO service_role;

ALTER TABLE public.single_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own single lessons"
ON public.single_lessons FOR ALL
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Students can view own single lessons"
ON public.single_lessons FOR SELECT
USING (
  student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = single_lessons.student_id AND s.auth_user_id = auth.uid()
  )
);

CREATE TRIGGER single_lessons_touch_updated_at
BEFORE UPDATE ON public.single_lessons
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_single_lessons_created_by_date ON public.single_lessons(created_by, lesson_date);
CREATE INDEX idx_single_lessons_student ON public.single_lessons(student_id);
