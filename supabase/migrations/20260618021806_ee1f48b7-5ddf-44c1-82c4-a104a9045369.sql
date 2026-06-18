
CREATE TABLE public.student_question_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.math_questions(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  last_is_correct boolean,
  last_answer text,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX idx_sqa_user ON public.student_question_attempts(user_id);
CREATE INDEX idx_sqa_question ON public.student_question_attempts(question_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_question_attempts TO authenticated;
GRANT ALL ON public.student_question_attempts TO service_role;

ALTER TABLE public.student_question_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own attempts"
  ON public.student_question_attempts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_sqa_touch
  BEFORE UPDATE ON public.student_question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.student_practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('paper','targeted','ai')),
  paper_id uuid REFERENCES public.math_papers(id) ON DELETE SET NULL,
  tag_ids uuid[] DEFAULT '{}',
  question_ids uuid[] NOT NULL DEFAULT '{}',
  total integer NOT NULL DEFAULT 0,
  correct integer NOT NULL DEFAULT 0,
  score numeric,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sps_user ON public.student_practice_sessions(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_practice_sessions TO authenticated;
GRANT ALL ON public.student_practice_sessions TO service_role;

ALTER TABLE public.student_practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own practice sessions"
  ON public.student_practice_sessions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
