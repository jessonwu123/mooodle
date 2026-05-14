
-- 角色枚举
CREATE TYPE public.app_role AS ENUM ('admin');

-- 用户角色表
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 角色检查函数（security definer 避免递归）
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "管理员可查看自己的角色" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 学生档案表
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_name ON public.students(LOWER(name));

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看学生" ON public.students
  FOR SELECT USING (true);

CREATE POLICY "管理员可创建学生" ON public.students
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "管理员可修改学生" ON public.students
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "管理员可删除学生" ON public.students
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 课堂评分表
CREATE TABLE public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lesson_date DATE NOT NULL,
  focus SMALLINT NOT NULL CHECK (focus BETWEEN 1 AND 5),
  interaction SMALLINT NOT NULL CHECK (interaction BETWEEN 1 AND 5),
  discipline SMALLINT NOT NULL CHECK (discipline BETWEEN 1 AND 5),
  accuracy SMALLINT NOT NULL CHECK (accuracy BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_ratings_student ON public.ratings(student_id, lesson_date DESC);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看评分" ON public.ratings
  FOR SELECT USING (true);

CREATE POLICY "管理员可创建评分" ON public.ratings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "管理员可修改评分" ON public.ratings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "管理员可删除评分" ON public.ratings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 自动给首个注册的用户授予 admin 角色
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 如果还没有任何 admin，将该用户设为 admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin();
