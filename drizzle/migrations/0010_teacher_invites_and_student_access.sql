ALTER TABLE public.students ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'full';
ALTER TABLE public.students ADD CONSTRAINT students_access_level_check CHECK (access_level IN ('full','limited'));
UPDATE public.students SET access_level = 'limited' WHERE created_by IS NULL AND auth_user_id IS NOT NULL;

CREATE TABLE public.teacher_invite_codes (
  user_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teacher_invite_codes TO authenticated;
GRANT ALL ON public.teacher_invite_codes TO service_role;
ALTER TABLE public.teacher_invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read own invite code" ON public.teacher_invite_codes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.teacher_invitations (
  invitee_user_id uuid PRIMARY KEY,
  inviter_user_id uuid NOT NULL,
  invite_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teacher_invitations TO authenticated;
GRANT ALL ON public.teacher_invitations TO service_role;
ALTER TABLE public.teacher_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read invitations" ON public.teacher_invitations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.practice_hint_daily_views (
  user_id uuid NOT NULL,
  usage_day date NOT NULL,
  question_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_day, question_id)
);
GRANT ALL ON public.practice_hint_daily_views TO service_role;
ALTER TABLE public.practice_hint_daily_views ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_practice_hint_view(p_user_id uuid, p_question_id uuid, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date := (now() AT TIME ZONE 'Asia/Shanghai')::date; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || d::text));
  IF EXISTS (SELECT 1 FROM practice_hint_daily_views WHERE user_id = p_user_id AND usage_day = d AND question_id = p_question_id) THEN
    RETURN true;
  END IF;
  SELECT count(*) INTO n FROM practice_hint_daily_views WHERE user_id = p_user_id AND usage_day = d;
  IF n >= p_limit THEN RETURN false; END IF;
  INSERT INTO practice_hint_daily_views(user_id, usage_day, question_id) VALUES (p_user_id, d, p_question_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_practice_hint_view(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_practice_hint_view(uuid, uuid, integer) TO service_role;