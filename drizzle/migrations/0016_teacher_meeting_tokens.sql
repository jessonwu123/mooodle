CREATE TABLE public.teacher_meeting_tokens (
  user_id UUID PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_meeting_tokens TO authenticated;
GRANT ALL ON public.teacher_meeting_tokens TO service_role;
ALTER TABLE public.teacher_meeting_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers manage their own meeting token"
ON public.teacher_meeting_tokens
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);