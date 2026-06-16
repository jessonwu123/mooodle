-- Tags table
CREATE TABLE public.math_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'knowledge',
  color text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.math_tags TO authenticated;
GRANT ALL ON public.math_tags TO service_role;

ALTER TABLE public.math_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tags" ON public.math_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert tags" ON public.math_tags
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update tags" ON public.math_tags
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tags" ON public.math_tags
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_math_tags_updated_at
  BEFORE UPDATE ON public.math_tags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Question-Tag junction
CREATE TABLE public.math_question_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.math_questions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.math_tags(id) ON DELETE CASCADE,
  assigned_by_ai boolean NOT NULL DEFAULT false,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, tag_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.math_question_tags TO authenticated;
GRANT ALL ON public.math_question_tags TO service_role;

ALTER TABLE public.math_question_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read question_tags" ON public.math_question_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert question_tags" ON public.math_question_tags
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update question_tags" ON public.math_question_tags
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete question_tags" ON public.math_question_tags
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_mqt_question ON public.math_question_tags(question_id);
CREATE INDEX idx_mqt_tag ON public.math_question_tags(tag_id);