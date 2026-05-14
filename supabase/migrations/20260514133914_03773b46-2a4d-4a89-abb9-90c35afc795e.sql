CREATE TYPE public.assessment_category AS ENUM ('knowledge', 'thinking', 'learning_quality');

CREATE TABLE public.assessment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  category public.assessment_category NOT NULL,
  item_name TEXT NOT NULL,
  rating SMALLINT,
  comment TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_assessment_items_student ON public.assessment_items(student_id, category, sort_order);

ALTER TABLE public.assessment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看综合素质" ON public.assessment_items FOR SELECT USING (true);
CREATE POLICY "管理员可创建综合素质" ON public.assessment_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "管理员可修改综合素质" ON public.assessment_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "管理员可删除综合素质" ON public.assessment_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER assessment_items_touch BEFORE UPDATE ON public.assessment_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();