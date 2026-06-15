
-- math_papers: 试卷元信息
CREATE TABLE public.math_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  name text NOT NULL,
  pdf_path text NOT NULL,
  answer_pdf_path text,
  question_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.math_papers TO authenticated;
GRANT ALL ON public.math_papers TO service_role;

ALTER TABLE public.math_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage papers" ON public.math_papers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers read papers" ON public.math_papers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_math_papers_updated_at
  BEFORE UPDATE ON public.math_papers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- math_questions: 题目
CREATE TABLE public.math_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.math_papers(id) ON DELETE CASCADE,
  year integer NOT NULL,
  question_number integer NOT NULL,
  stem text NOT NULL,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  option_e text,
  correct_answer text,
  answer_type text NOT NULL DEFAULT 'choice',
  image_path text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paper_id, question_number)
);

CREATE INDEX math_questions_paper_idx ON public.math_questions(paper_id);
CREATE INDEX math_questions_year_idx ON public.math_questions(year);
CREATE INDEX math_questions_tags_idx ON public.math_questions USING GIN(tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.math_questions TO authenticated;
GRANT ALL ON public.math_questions TO service_role;

ALTER TABLE public.math_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage questions" ON public.math_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers read questions" ON public.math_questions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_math_questions_updated_at
  BEFORE UPDATE ON public.math_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
