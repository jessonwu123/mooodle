-- Add overall progress percentage to ratings
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS overall_progress smallint
  CHECK (overall_progress IS NULL OR (overall_progress >= 0 AND overall_progress <= 100));

-- Create progress_items table for custom knowledge-point absorption per lesson
CREATE TABLE IF NOT EXISTS public.progress_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id uuid NOT NULL REFERENCES public.ratings(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  percentage smallint NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_progress_items_rating ON public.progress_items(rating_id);

ALTER TABLE public.progress_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查看授课进度"
ON public.progress_items
FOR SELECT
USING (true);

CREATE POLICY "创建者或管理员可创建授课进度"
ON public.progress_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.ratings r
    JOIN public.students s ON s.id = r.student_id
    WHERE r.id = progress_items.rating_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "创建者或管理员可修改授课进度"
ON public.progress_items
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.ratings r
    JOIN public.students s ON s.id = r.student_id
    WHERE r.id = progress_items.rating_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "创建者或管理员可删除授课进度"
ON public.progress_items
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.ratings r
    JOIN public.students s ON s.id = r.student_id
    WHERE r.id = progress_items.rating_id AND s.created_by = auth.uid()
  )
);
