
-- math-papers bucket
CREATE POLICY "Admins manage math-papers"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'math-papers' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'math-papers' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers read math-papers"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'math-papers' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')));

-- math-question-images bucket
CREATE POLICY "Admins manage math-question-images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'math-question-images' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'math-question-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers read math-question-images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'math-question-images' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')));
