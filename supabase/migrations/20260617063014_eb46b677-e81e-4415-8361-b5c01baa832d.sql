DROP POLICY IF EXISTS "authenticated read folders" ON public.math_paper_folders;
CREATE POLICY "Teachers read folders" ON public.math_paper_folders FOR SELECT TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can read question_tags" ON public.math_question_tags;
CREATE POLICY "Teachers read question_tags" ON public.math_question_tags FOR SELECT TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));