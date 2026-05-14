-- 1. 增加 created_by 字段
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS created_by uuid;

-- 把存量学生归属到第一个 admin 名下，避免没人能管理
UPDATE public.students
SET created_by = (
  SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
)
WHERE created_by IS NULL;

-- 2. 自动设置 created_by 的触发器
CREATE OR REPLACE FUNCTION public.set_student_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_set_created_by ON public.students;
CREATE TRIGGER students_set_created_by
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_student_created_by();

-- 3. 重写 students 表的写权限策略
DROP POLICY IF EXISTS "管理员可修改学生" ON public.students;
DROP POLICY IF EXISTS "管理员可创建学生" ON public.students;
DROP POLICY IF EXISTS "管理员可删除学生" ON public.students;

CREATE POLICY "教师可创建学生" ON public.students
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "创建者或管理员可修改学生" ON public.students
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "创建者或管理员可删除学生" ON public.students
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 4. ratings 表跟随学生归属
DROP POLICY IF EXISTS "管理员可创建评分" ON public.ratings;
DROP POLICY IF EXISTS "管理员可修改评分" ON public.ratings;
DROP POLICY IF EXISTS "管理员可删除评分" ON public.ratings;

CREATE POLICY "创建者或管理员可创建评分" ON public.ratings
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.created_by = auth.uid())
);

CREATE POLICY "创建者或管理员可修改评分" ON public.ratings
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.created_by = auth.uid())
);

CREATE POLICY "创建者或管理员可删除评分" ON public.ratings
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.created_by = auth.uid())
);

-- 5. assessment_items 表跟随学生归属
DROP POLICY IF EXISTS "管理员可创建综合素质" ON public.assessment_items;
DROP POLICY IF EXISTS "管理员可修改综合素质" ON public.assessment_items;
DROP POLICY IF EXISTS "管理员可删除综合素质" ON public.assessment_items;

CREATE POLICY "创建者或管理员可创建综合素质" ON public.assessment_items
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.created_by = auth.uid())
);

CREATE POLICY "创建者或管理员可修改综合素质" ON public.assessment_items
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.created_by = auth.uid())
);

CREATE POLICY "创建者或管理员可删除综合素质" ON public.assessment_items
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.created_by = auth.uid())
);

-- 6. 管理员查询：列出全部教师账号
CREATE OR REPLACE FUNCTION public.list_all_teachers()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, is_admin boolean, student_count bigint)
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
      (SELECT count(*) FROM public.students s WHERE s.created_by = u.id)
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_all_teachers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_all_teachers() TO authenticated;

-- 7. 管理员查询：列出某位老师的学生
CREATE OR REPLACE FUNCTION public.list_teacher_students(_teacher_id uuid)
RETURNS TABLE(id uuid, name text, created_at timestamptz, rating_count bigint)
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
    SELECT s.id, s.name, s.created_at,
      (SELECT count(*) FROM public.ratings r WHERE r.student_id = s.id)
    FROM public.students s
    WHERE s.created_by = _teacher_id
    ORDER BY s.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_teacher_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teacher_students(uuid) TO authenticated;