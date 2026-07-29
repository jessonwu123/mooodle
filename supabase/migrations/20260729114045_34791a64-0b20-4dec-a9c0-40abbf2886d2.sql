
-- Helper: check whether current user may read a given paper based on folder permissions
CREATE OR REPLACE FUNCTION public.user_can_read_paper(_paper_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _folder uuid;
  _student_id uuid;
  _lvl public.folder_permission_level;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_uid, 'admin') THEN
    RETURN true;
  END IF;

  SELECT folder_id INTO _folder FROM public.math_papers WHERE id = _paper_id;

  IF public.has_role(_uid, 'teacher') THEN
    IF _folder IS NULL THEN
      -- No folder assigned: preserve prior teacher-wide access for unfiled papers
      RETURN true;
    END IF;
    _lvl := public.get_effective_folder_permission(_folder, 'teacher', _uid);
    RETURN _lvl IS NOT NULL AND _lvl <> 'none';
  END IF;

  -- Student path
  SELECT id INTO _student_id FROM public.students WHERE auth_user_id = _uid LIMIT 1;
  IF _student_id IS NULL OR _folder IS NULL THEN
    RETURN false;
  END IF;
  _lvl := public.get_effective_folder_permission(_folder, 'student', _student_id);
  RETURN _lvl IS NOT NULL AND _lvl <> 'none';
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_read_paper(uuid) TO authenticated;

-- Tighten math_papers SELECT policy
DROP POLICY IF EXISTS "Teachers read papers" ON public.math_papers;
CREATE POLICY "Read papers by folder permission"
  ON public.math_papers
  FOR SELECT
  TO authenticated
  USING (public.user_can_read_paper(id));

-- Tighten math_questions SELECT policy
DROP POLICY IF EXISTS "Teachers read questions" ON public.math_questions;
CREATE POLICY "Read questions by folder permission"
  ON public.math_questions
  FOR SELECT
  TO authenticated
  USING (public.user_can_read_paper(paper_id));

-- Storage: math-papers bucket – enforce folder permission on the owning paper
DROP POLICY IF EXISTS "Teachers read math-papers" ON storage.objects;
CREATE POLICY "Read math-papers by folder permission"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'math-papers'
    AND (
      has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.math_papers p
        WHERE (p.pdf_path = storage.objects.name OR p.answer_pdf_path = storage.objects.name)
          AND public.user_can_read_paper(p.id)
      )
    )
  );

-- Storage: math-question-images bucket – path shape is <year>/<paper_id>/...
DROP POLICY IF EXISTS "Teachers read math-question-images" ON storage.objects;
CREATE POLICY "Read math-question-images by folder permission"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'math-question-images'
    AND (
      has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.math_papers p
        WHERE p.id::text = split_part(storage.objects.name, '/', 2)
          AND public.user_can_read_paper(p.id)
      )
    )
  );
