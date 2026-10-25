CREATE TABLE public.teacher_question_bank_permissions (
 user_id uuid PRIMARY KEY,
 can_edit boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_question_bank_permissions TO authenticated;
GRANT ALL ON public.teacher_question_bank_permissions TO service_role;
ALTER TABLE public.teacher_question_bank_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own question bank permission" ON public.teacher_question_bank_permissions FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins set question bank permission" ON public.teacher_question_bank_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.can_edit_question_bank() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'teacher') AND EXISTS(SELECT 1 FROM public.teacher_question_bank_permissions WHERE user_id=auth.uid() AND can_edit));
$$;
REVOKE ALL ON FUNCTION public.can_edit_question_bank() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_question_bank() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.set_teacher_question_bank_permission(_user_id uuid, _can_edit boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION '仅管理员可设置题库权限' USING ERRCODE='42501'; END IF;
 IF NOT public.has_role(_user_id,'teacher') OR public.has_role(_user_id,'admin') THEN RAISE EXCEPTION '请选择普通教师账号'; END IF;
 INSERT INTO public.teacher_question_bank_permissions(user_id,can_edit,updated_at) VALUES(_user_id,_can_edit,now()) ON CONFLICT(user_id) DO UPDATE SET can_edit=excluded.can_edit,updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_teacher_question_bank_permission(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_question_bank_permission(uuid,boolean) TO authenticated;
CREATE POLICY "Authorized editors manage papers" ON public.math_papers FOR ALL TO authenticated USING (public.can_edit_question_bank()) WITH CHECK (public.can_edit_question_bank());
CREATE POLICY "Authorized editors manage questions" ON public.math_questions FOR ALL TO authenticated USING (public.can_edit_question_bank()) WITH CHECK (public.can_edit_question_bank());
CREATE POLICY "Authorized editors manage tags" ON public.math_tags FOR ALL TO authenticated USING (public.can_edit_question_bank()) WITH CHECK (public.can_edit_question_bank());
CREATE POLICY "Authorized editors manage question tags" ON public.math_question_tags FOR ALL TO authenticated USING (public.can_edit_question_bank()) WITH CHECK (public.can_edit_question_bank());
CREATE POLICY "Authorized editors manage folders" ON public.math_paper_folders FOR ALL TO authenticated USING (public.can_edit_question_bank()) WITH CHECK (public.can_edit_question_bank());
CREATE POLICY "Authorized editors manage question bank media" ON storage.objects FOR ALL TO authenticated USING (bucket_id IN ('math-papers','math-question-images') AND public.can_edit_question_bank()) WITH CHECK (bucket_id IN ('math-papers','math-question-images') AND public.can_edit_question_bank());
COMMENT ON TABLE public.teacher_question_bank_permissions IS 'Admin-managed teacher editing grant; absent rows deny writes. Read/download policies remain independent.';