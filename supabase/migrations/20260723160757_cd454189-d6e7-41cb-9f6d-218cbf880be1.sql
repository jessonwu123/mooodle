DROP POLICY IF EXISTS "Students can view own single lessons" ON public.single_lessons;
CREATE POLICY "Students can view own single lessons"
ON public.single_lessons FOR SELECT
USING (student_id IS NOT NULL AND public.is_my_student_row(student_id));