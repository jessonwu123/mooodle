
DROP POLICY IF EXISTS "授权用户可查看评分" ON public.ratings;
CREATE POLICY "授权用户可查看评分" ON public.ratings FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.is_my_student_row(student_id) OR
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = ratings.student_id AND s.created_by = auth.uid())
);

DROP POLICY IF EXISTS "授权用户可查看授课进度" ON public.progress_items;
CREATE POLICY "授权用户可查看授课进度" ON public.progress_items FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.ratings r
    WHERE r.id = progress_items.rating_id
      AND (public.is_my_student_row(r.student_id)
           OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = r.student_id AND s.created_by = auth.uid()))
  )
);

DROP POLICY IF EXISTS "授权用户可查看综合素质" ON public.assessment_items;
CREATE POLICY "授权用户可查看综合素质" ON public.assessment_items FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.is_my_student_row(student_id) OR
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = assessment_items.student_id AND s.created_by = auth.uid())
);

DROP POLICY IF EXISTS "授权用户可查看评估历史" ON public.assessment_item_history;
CREATE POLICY "授权用户可查看评估历史" ON public.assessment_item_history FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.is_my_student_row(student_id) OR
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = assessment_item_history.student_id AND s.created_by = auth.uid())
);

DROP POLICY IF EXISTS "授权用户可查看取消课次" ON public.cancelled_lessons;
CREATE POLICY "授权用户可查看取消课次" ON public.cancelled_lessons FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.is_my_student_row(student_id) OR
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = cancelled_lessons.student_id AND s.created_by = auth.uid())
);
