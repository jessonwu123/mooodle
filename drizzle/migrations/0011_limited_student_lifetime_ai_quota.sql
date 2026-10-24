CREATE TABLE public.practice_ai_lifetime_usage (user_id uuid PRIMARY KEY, used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 10), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.practice_ai_lifetime_usage TO authenticated;
GRANT ALL ON public.practice_ai_lifetime_usage TO service_role;
ALTER TABLE public.practice_ai_lifetime_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_ai_lifetime_usage ON public.practice_ai_lifetime_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.claim_limited_practice_ai_analysis(p_session_id uuid, p_user_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
INSERT INTO public.practice_ai_feedback(session_id,user_id) VALUES(p_session_id,p_user_id) ON CONFLICT DO NOTHING;
IF NOT FOUND THEN RETURN -2; END IF;
INSERT INTO public.practice_ai_lifetime_usage(user_id,used) VALUES(p_user_id,1) ON CONFLICT(user_id) DO UPDATE SET used=practice_ai_lifetime_usage.used+1, updated_at=now() WHERE practice_ai_lifetime_usage.used<10 RETURNING used INTO n;
IF n IS NULL THEN DELETE FROM public.practice_ai_feedback WHERE session_id=p_session_id; RETURN -1; END IF;
RETURN 10-n;
END; $$;
REVOKE ALL ON FUNCTION public.claim_limited_practice_ai_analysis(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_limited_practice_ai_analysis(uuid,uuid) TO service_role;