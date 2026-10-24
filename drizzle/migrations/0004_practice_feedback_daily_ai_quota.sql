ALTER TABLE public.student_practice_sessions ADD COLUMN student_id uuid REFERENCES public.students(id);
CREATE TABLE public.practice_ai_daily_usage (user_id uuid NOT NULL, usage_day date NOT NULL, used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 10), PRIMARY KEY(user_id,usage_day));
GRANT SELECT ON public.practice_ai_daily_usage TO authenticated;
GRANT ALL ON public.practice_ai_daily_usage TO service_role;
ALTER TABLE public.practice_ai_daily_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_ai_usage ON public.practice_ai_daily_usage FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.practice_ai_feedback (session_id uuid PRIMARY KEY REFERENCES public.student_practice_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','done','failed')), content text NOT NULL DEFAULT '', error_message text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.practice_ai_feedback TO authenticated;
GRANT ALL ON public.practice_ai_feedback TO service_role;
ALTER TABLE public.practice_ai_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_ai_feedback ON public.practice_ai_feedback FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.practice_ai_access_state (id text PRIMARY KEY, message text NOT NULL, status integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.practice_ai_access_state TO service_role;
ALTER TABLE public.practice_ai_access_state ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.claim_practice_ai_analysis(p_session_id uuid,p_user_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; d date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
INSERT INTO public.practice_ai_feedback(session_id,user_id) VALUES(p_session_id,p_user_id) ON CONFLICT DO NOTHING;
IF NOT FOUND THEN RETURN -2; END IF;
INSERT INTO public.practice_ai_daily_usage(user_id,usage_day,used) VALUES(p_user_id,d,1) ON CONFLICT(user_id,usage_day) DO UPDATE SET used=practice_ai_daily_usage.used+1 WHERE practice_ai_daily_usage.used<10 RETURNING used INTO n;
IF n IS NULL THEN DELETE FROM public.practice_ai_feedback WHERE session_id=p_session_id; RETURN -1; END IF;
RETURN 10-n;
END; $$;
REVOKE ALL ON FUNCTION public.claim_practice_ai_analysis(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_practice_ai_analysis(uuid,uuid) TO service_role;