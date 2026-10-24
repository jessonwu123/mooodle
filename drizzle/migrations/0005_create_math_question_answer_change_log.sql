CREATE TABLE public.math_question_answer_change_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 question_id uuid NOT NULL,
 batch_key text NOT NULL,
 stem_snapshot text NOT NULL,
 old_answer text NOT NULL,
 new_answer text NOT NULL,
 reason text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (batch_key, question_id),
 CHECK (old_answer IS DISTINCT FROM new_answer)
);
GRANT SELECT ON public.math_question_answer_change_log TO authenticated;
GRANT SELECT, INSERT ON public.math_question_answer_change_log TO service_role;
ALTER TABLE public.math_question_answer_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers and administrators read answer correction history" ON public.math_question_answer_change_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE INDEX math_question_answer_change_log_question_time ON public.math_question_answer_change_log(question_id, changed_at DESC);
COMMENT ON TABLE public.math_question_answer_change_log IS 'Append-only records of explicitly applied answer correction batches; snapshots survive question deletion. No authenticated write access.';