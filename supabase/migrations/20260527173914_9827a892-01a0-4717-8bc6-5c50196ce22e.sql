-- 食物种类枚举
CREATE TYPE public.food_tier AS ENUM ('normal', 'quality', 'elixir');

-- 宠物种类枚举
CREATE TYPE public.pet_species AS ENUM (
  'baize','dijiang','jiuweihu','jingwei','zhuyin',
  'qilin','qinglong','baihu','zhuque','xuanwu'
);

-- 学生宠物表（每人一只）
CREATE TABLE public.pets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL UNIQUE,
  species public.pet_species,
  level SMALLINT NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  hatched BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pets TO authenticated;
GRANT ALL ON public.pets TO service_role;

ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看宠物" ON public.pets FOR SELECT USING (true);

CREATE POLICY "学生/创建者/管理员可创建宠物" ON public.pets FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = pets.student_id
      AND (s.auth_user_id = auth.uid() OR s.created_by = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "学生/创建者/管理员可修改宠物" ON public.pets FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = pets.student_id
      AND (s.auth_user_id = auth.uid() OR s.created_by = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "学生/创建者/管理员可删除宠物" ON public.pets FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = pets.student_id
      AND (s.auth_user_id = auth.uid() OR s.created_by = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER pets_touch_updated_at BEFORE UPDATE ON public.pets
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 食物背包
CREATE TABLE public.pet_foods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  tier public.food_tier NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, tier)
);

GRANT SELECT ON public.pet_foods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pet_foods TO authenticated;
GRANT ALL ON public.pet_foods TO service_role;

ALTER TABLE public.pet_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看食物" ON public.pet_foods FOR SELECT USING (true);

CREATE POLICY "学生/创建者/管理员可创建食物" ON public.pet_foods FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = pet_foods.student_id
      AND (s.auth_user_id = auth.uid() OR s.created_by = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "学生/创建者/管理员可修改食物" ON public.pet_foods FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = pet_foods.student_id
      AND (s.auth_user_id = auth.uid() OR s.created_by = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "学生/创建者/管理员可删除食物" ON public.pet_foods FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = pet_foods.student_id
      AND (s.auth_user_id = auth.uid() OR s.created_by = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER pet_foods_touch_updated_at BEFORE UPDATE ON public.pet_foods
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();