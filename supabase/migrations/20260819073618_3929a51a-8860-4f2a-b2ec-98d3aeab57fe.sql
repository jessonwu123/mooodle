CREATE POLICY "Admins view all single lessons"
ON public.single_lessons FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));