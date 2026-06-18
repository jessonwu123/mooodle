CREATE TABLE public.student_learning_analytics_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  content text NOT NULL,
  chart_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slaa_student_published ON public.student_learning_analytics_archives(student_id, published_at DESC);

GRANT SELECT ON public.student_learning_analytics_archives TO authenticated;
GRANT ALL ON public.student_learning_analytics_archives TO service_role;

ALTER TABLE public.student_learning_analytics_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students can view their own archives"
ON public.student_learning_analytics_archives
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_id AND s.auth_user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
);