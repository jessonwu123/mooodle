
-- Teacher display info accessible to the student themselves
CREATE OR REPLACE FUNCTION public.get_my_teacher_info()
RETURNS TABLE(teacher_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email::text
  FROM public.students s
  JOIN auth.users u ON u.id = s.created_by
  WHERE s.auth_user_id = auth.uid()
  LIMIT 1;
END;
$$;

-- Notes students attach to teacher-arranged lessons
CREATE TABLE public.student_lesson_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lesson_ref text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_lesson_notes TO authenticated;
GRANT ALL ON public.student_lesson_notes TO service_role;

ALTER TABLE public.student_lesson_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student manages own lesson notes"
ON public.student_lesson_notes
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_user_id = auth.uid()));

CREATE POLICY "Teacher reads student lesson notes"
ON public.student_lesson_notes
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.created_by = auth.uid()));

CREATE TRIGGER touch_student_lesson_notes
BEFORE UPDATE ON public.student_lesson_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
