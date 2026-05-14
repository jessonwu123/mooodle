-- 综合素质评估项目的历史变更记录表
CREATE TABLE public.assessment_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.assessment_items(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  rating smallint,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_assessment_item_history_item ON public.assessment_item_history(item_id, created_at DESC);
CREATE INDEX idx_assessment_item_history_student ON public.assessment_item_history(student_id, created_at DESC);

ALTER TABLE public.assessment_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看评估历史"
ON public.assessment_item_history
FOR SELECT
USING (true);

CREATE POLICY "创建者或管理员可创建评估历史"
ON public.assessment_item_history
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = assessment_item_history.student_id
      AND s.created_by = auth.uid()
  )
);

CREATE POLICY "创建者或管理员可删除评估历史"
ON public.assessment_item_history
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = assessment_item_history.student_id
      AND s.created_by = auth.uid()
  )
);