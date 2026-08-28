CREATE TABLE public.teacher_org_rates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  group_rate numeric NOT NULL DEFAULT 0,
  one_on_one_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_org_rates TO authenticated;
GRANT ALL ON public.teacher_org_rates TO service_role;

ALTER TABLE public.teacher_org_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own org rates"
ON public.teacher_org_rates FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view org rates"
ON public.teacher_org_rates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER teacher_org_rates_touch
BEFORE UPDATE ON public.teacher_org_rates
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();