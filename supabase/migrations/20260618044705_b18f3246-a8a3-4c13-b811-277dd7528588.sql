
CREATE TABLE public.student_learning_analytics (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  chart_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT ALL ON public.student_learning_analytics TO service_role;

ALTER TABLE public.student_learning_analytics ENABLE ROW LEVEL SECURITY;
