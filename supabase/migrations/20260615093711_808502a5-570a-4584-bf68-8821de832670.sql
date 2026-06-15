-- Clear existing question bank data
DELETE FROM public.math_questions;
DELETE FROM public.math_papers;

-- Make legacy fields more flexible for the new folder-based bank
ALTER TABLE public.math_papers ALTER COLUMN year DROP NOT NULL;
ALTER TABLE public.math_papers ALTER COLUMN pdf_path DROP NOT NULL;
ALTER TABLE public.math_papers ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'paper'
  CHECK (kind IN ('paper','answer'));

-- Folder tree
CREATE TABLE public.math_paper_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES public.math_paper_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX math_paper_folders_parent_idx ON public.math_paper_folders(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.math_paper_folders TO authenticated;
GRANT ALL ON public.math_paper_folders TO service_role;

ALTER TABLE public.math_paper_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage folders" ON public.math_paper_folders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated read folders" ON public.math_paper_folders FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER math_paper_folders_touch BEFORE UPDATE ON public.math_paper_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Link papers to folders
ALTER TABLE public.math_papers
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.math_paper_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS math_papers_folder_idx ON public.math_papers(folder_id);