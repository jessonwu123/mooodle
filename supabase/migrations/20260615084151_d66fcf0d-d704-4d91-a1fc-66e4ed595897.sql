
-- Drop public-readable SELECT policies and replace with authenticated, scoped ones

-- students
DROP POLICY IF EXISTS "任何人可查看学生" ON public.students;
CREATE POLICY "已登录用户可查看学生" ON public.students
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
    OR auth_user_id = auth.uid()
  );

-- ratings
DROP POLICY IF EXISTS "任何人可查看评分" ON public.ratings;
CREATE POLICY "授权用户可查看评分" ON public.ratings
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ratings.student_id
        AND (s.created_by = auth.uid() OR s.auth_user_id = auth.uid())
    )
  );

-- assessment_items
DROP POLICY IF EXISTS "任何人可查看综合素质" ON public.assessment_items;
CREATE POLICY "授权用户可查看综合素质" ON public.assessment_items
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = assessment_items.student_id
        AND (s.created_by = auth.uid() OR s.auth_user_id = auth.uid())
    )
  );

-- assessment_item_history
DROP POLICY IF EXISTS "任何人可查看评估历史" ON public.assessment_item_history;
CREATE POLICY "授权用户可查看评估历史" ON public.assessment_item_history
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = assessment_item_history.student_id
        AND (s.created_by = auth.uid() OR s.auth_user_id = auth.uid())
    )
  );

-- progress_items
DROP POLICY IF EXISTS "任何人可查看授课进度" ON public.progress_items;
CREATE POLICY "授权用户可查看授课进度" ON public.progress_items
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.ratings r
      JOIN public.students s ON s.id = r.student_id
      WHERE r.id = progress_items.rating_id
        AND (s.created_by = auth.uid() OR s.auth_user_id = auth.uid())
    )
  );

-- cancelled_lessons
DROP POLICY IF EXISTS "任何人可查看取消课次" ON public.cancelled_lessons;
CREATE POLICY "授权用户可查看取消课次" ON public.cancelled_lessons
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = cancelled_lessons.student_id
        AND (s.created_by = auth.uid() OR s.auth_user_id = auth.uid())
    )
  );

-- pets
DROP POLICY IF EXISTS "任何人可查看宠物" ON public.pets;
CREATE POLICY "授权用户可查看宠物" ON public.pets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = pets.student_id
        AND (s.created_by = auth.uid() OR s.auth_user_id = auth.uid())
    )
  );

-- pet_foods
DROP POLICY IF EXISTS "任何人可查看食物" ON public.pet_foods;
CREATE POLICY "授权用户可查看食物" ON public.pet_foods
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = pet_foods.student_id
        AND (s.created_by = auth.uid() OR s.auth_user_id = auth.uid())
    )
  );

-- Lock down has_role; RLS policy evaluation uses definer privileges and does not require EXECUTE grant to callers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
