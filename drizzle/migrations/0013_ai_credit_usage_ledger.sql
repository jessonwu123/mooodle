ALTER TABLE public.students ADD COLUMN IF NOT EXISTS account_created_by uuid;
UPDATE public.students SET account_created_by = created_by WHERE auth_user_id IS NOT NULL AND account_created_by IS NULL AND created_by IS NOT NULL;
COMMENT ON COLUMN public.students.account_created_by IS 'Teacher who created the login account; distinct from mutable archive ownership. Legacy accounts backfilled from archive creator.';
CREATE TABLE public.ai_credit_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_user_id uuid NOT NULL,
 teacher_user_id uuid,
 student_id uuid,
 actor_kind text NOT NULL CHECK (actor_kind IN ('teacher','student')),
 actor_name text NOT NULL,
 feature text NOT NULL,
 model text NOT NULL,
 gateway_run_id text,
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','aborted','incomplete')),
 http_status integer,
 input_tokens bigint,
 cached_input_tokens bigint,
 output_tokens bigint,
 estimated_credits numeric(20,10),
 pricing_snapshot jsonb,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 CHECK (input_tokens IS NULL OR input_tokens >= 0),
 CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
 CHECK (output_tokens IS NULL OR output_tokens >= 0),
 CHECK (estimated_credits IS NULL OR estimated_credits >= 0)
);
GRANT SELECT ON public.ai_credit_usage TO authenticated;
GRANT ALL ON public.ai_credit_usage TO service_role;
ALTER TABLE public.ai_credit_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read AI credit usage" ON public.ai_credit_usage FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX ai_credit_usage_teacher_time_idx ON public.ai_credit_usage (teacher_user_id, started_at DESC);
CREATE INDEX ai_credit_usage_time_idx ON public.ai_credit_usage (started_at DESC);
CREATE OR REPLACE FUNCTION public.ai_credit_usage_summary(p_from timestamptz, p_to timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION '仅管理员可查看 credits 用量'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '366 days' THEN RAISE EXCEPTION '日期范围无效（最多366天）'; END IF;
 WITH filtered AS (SELECT * FROM public.ai_credit_usage WHERE started_at >= p_from AND started_at < p_to),
 teacher_totals AS (
 SELECT teacher_user_id, count(*) AS requests, count(*) FILTER (WHERE estimated_credits IS NULL) AS unknown_requests,
 coalesce(sum(estimated_credits),0) AS credits,
 coalesce(sum(estimated_credits) FILTER (WHERE actor_kind='teacher'),0) AS teacher_credits,
 coalesce(sum(estimated_credits) FILTER (WHERE actor_kind='student'),0) AS student_credits
 FROM filtered GROUP BY teacher_user_id),
 actor_totals AS (
 SELECT teacher_user_id, actor_user_id, actor_kind, max(actor_name) AS actor_name, count(*) AS requests,
 count(*) FILTER (WHERE estimated_credits IS NULL) AS unknown_requests, coalesce(sum(estimated_credits),0) AS credits
 FROM filtered GROUP BY teacher_user_id,actor_user_id,actor_kind),
 feature_totals AS (
 SELECT teacher_user_id, feature, count(*) AS requests, count(*) FILTER (WHERE estimated_credits IS NULL) AS unknown_requests,
 coalesce(sum(estimated_credits),0) AS credits FROM filtered GROUP BY teacher_user_id,feature)
 SELECT jsonb_build_object(
 'teachers',coalesce((SELECT jsonb_agg(to_jsonb(t) || jsonb_build_object('teacher_name',coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email,'未归属老师'),'teacher_email',u.email) ORDER BY t.credits DESC) FROM teacher_totals t LEFT JOIN auth.users u ON u.id=t.teacher_user_id),'[]'::jsonb),
 'actors',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.credits DESC) FROM actor_totals a),'[]'::jsonb),
 'features',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.credits DESC) FROM feature_totals f),'[]'::jsonb),
 'recording_since',(SELECT min(started_at) FROM public.ai_credit_usage)) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.ai_credit_usage_summary(timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_credit_usage_summary(timestamptz,timestamptz) TO authenticated,service_role;