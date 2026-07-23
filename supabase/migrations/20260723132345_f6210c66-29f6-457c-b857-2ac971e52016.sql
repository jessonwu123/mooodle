
CREATE OR REPLACE FUNCTION public.is_my_student_row(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id AND s.auth_user_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS "Student manages own lesson notes" ON public.student_lesson_notes;
CREATE POLICY "Student manages own lesson notes"
ON public.student_lesson_notes
FOR ALL
TO authenticated
USING (public.is_my_student_row(student_id))
WITH CHECK (public.is_my_student_row(student_id));

DROP FUNCTION IF EXISTS public.get_my_teacher_info();
CREATE OR REPLACE FUNCTION public.get_my_teacher_info()
RETURNS TABLE(teacher_id uuid, email text, display_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email::text,
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'display_name',''),
      NULLIF(u.raw_user_meta_data->>'full_name',''),
      NULLIF(u.raw_user_meta_data->>'name','')
    )
  FROM public.students s
  JOIN auth.users u ON u.id = s.created_by
  WHERE s.auth_user_id = auth.uid()
  LIMIT 1;
END;
$$;
