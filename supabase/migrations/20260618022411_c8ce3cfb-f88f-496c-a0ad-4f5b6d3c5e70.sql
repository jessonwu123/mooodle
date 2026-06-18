
CREATE TABLE public.student_question_attempt_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.math_questions(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.student_practice_sessions(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('paper','targeted','ai')),
  answer text,
  correct_answer text,
  is_correct boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sqal_user_time ON public.student_question_attempt_log(user_id, attempted_at DESC);
CREATE INDEX idx_sqal_question ON public.student_question_attempt_log(question_id);

GRANT SELECT, INSERT ON public.student_question_attempt_log TO authenticated;
GRANT ALL ON public.student_question_attempt_log TO service_role;

ALTER TABLE public.student_question_attempt_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own attempt log"
  ON public.student_question_attempt_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own attempt log"
  ON public.student_question_attempt_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Admin can also see aggregates and sessions
CREATE POLICY "Admins read all attempts"
  ON public.student_question_attempts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read all practice sessions"
  ON public.student_practice_sessions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
