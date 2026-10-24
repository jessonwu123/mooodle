CREATE TABLE public.math_question_hint_generation_batches (
  batch_key text PRIMARY KEY,
  generated_hints jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.math_question_hint_generation_batches TO service_role;
GRANT INSERT ON public.math_question_hint_generation_batches TO sandbox_exec;
ALTER TABLE public.math_question_hint_generation_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authorized sandbox can stage generated hint batches" ON public.math_question_hint_generation_batches FOR INSERT TO sandbox_exec WITH CHECK (true);
COMMENT ON TABLE public.math_question_hint_generation_batches IS 'Private provenance and staging for authorized bulk generation of precomputed exam hints. No application-user access.';