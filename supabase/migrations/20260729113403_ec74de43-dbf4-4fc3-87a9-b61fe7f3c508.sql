CREATE TABLE public.teacher_xngj_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  password text NOT NULL,
  tenant_name text NOT NULL DEFAULT '犀牛教育',
  xngj_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_xngj_credentials TO authenticated;
GRANT ALL ON public.teacher_xngj_credentials TO service_role;

ALTER TABLE public.teacher_xngj_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own creds select" ON public.teacher_xngj_credentials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own creds insert" ON public.teacher_xngj_credentials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own creds update" ON public.teacher_xngj_credentials
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own creds delete" ON public.teacher_xngj_credentials
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_teacher_xngj_credentials_updated
  BEFORE UPDATE ON public.teacher_xngj_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();