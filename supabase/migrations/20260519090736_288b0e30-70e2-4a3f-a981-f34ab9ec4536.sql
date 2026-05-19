
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS schedule_slots jsonb,
  ADD COLUMN IF NOT EXISTS schedule_frequency_weeks smallint DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.cancelled_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  lesson_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_at)
);

ALTER TABLE public.cancelled_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看取消课次"
  ON public.cancelled_lessons FOR SELECT
  USING (true);

CREATE POLICY "创建者或管理员可创建取消课次"
  ON public.cancelled_lessons FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = cancelled_lessons.student_id AND s.created_by = auth.uid()
    )
  );

CREATE POLICY "创建者或管理员可删除取消课次"
  ON public.cancelled_lessons FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = cancelled_lessons.student_id AND s.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_cancelled_lessons_student ON public.cancelled_lessons(student_id);
