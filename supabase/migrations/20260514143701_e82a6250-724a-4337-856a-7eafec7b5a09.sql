-- 1. 给已存在用户补上 teacher 角色（除非已有 admin/teacher）
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'teacher'::app_role
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = u.id AND ur.role IN ('admin'::app_role, 'teacher'::app_role)
)
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. 更新 handle_new_user_admin：新用户自动 teacher；首位用户同时 admin
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 如果还没有任何 admin，将该用户设为 admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  -- 同时设置为 teacher
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 确认触发器存在
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin();

-- 3. 替换 students 写策略：允许 teacher 或 admin 创建
DROP POLICY IF EXISTS "教师可创建学生" ON public.students;
CREATE POLICY "教师或管理员可创建学生" ON public.students
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'admin')
);

-- 4. 重写 list_all_teachers 函数：包含 is_teacher 与 is_admin
DROP FUNCTION IF EXISTS public.list_all_teachers();
CREATE OR REPLACE FUNCTION public.list_all_teachers()
RETURNS TABLE(
  user_id uuid,
  email text,
  created_at timestamptz,
  is_admin boolean,
  is_teacher boolean,
  student_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '需要管理员权限';
  END IF;
  RETURN QUERY
    SELECT
      u.id,
      u.email::text,
      u.created_at,
      EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'),
      EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'teacher'),
      (SELECT count(*) FROM public.students s WHERE s.created_by = u.id)
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_all_teachers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_all_teachers() TO authenticated;