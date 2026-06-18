
-- Restrict math_tags reads to teachers/admins only
DROP POLICY IF EXISTS "Authenticated can read tags" ON public.math_tags;
CREATE POLICY "Teachers and admins can read tags"
ON public.math_tags
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

-- Prevent students from reading sensitive financial / schedule columns on students
-- by removing the student self-read path from the SELECT policy.
DROP POLICY IF EXISTS "已登录用户可查看学生" ON public.students;
CREATE POLICY "教师或管理员可查看学生"
ON public.students
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
);

-- Provide a safe RPC for students to fetch only non-sensitive profile fields about themselves.
CREATE OR REPLACE FUNCTION public.get_my_student_profile()
RETURNS TABLE (
  id uuid,
  name text,
  username text,
  auth_user_id uuid,
  knowledge_updated_at timestamptz,
  thinking_updated_at timestamptz,
  learning_quality_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.username, s.auth_user_id,
         s.knowledge_updated_at, s.thinking_updated_at, s.learning_quality_updated_at
  FROM public.students s
  WHERE s.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_student_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_student_profile() TO authenticated;
