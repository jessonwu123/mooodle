-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.folder_permission_level AS ENUM ('none','read','download','upload','manage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.math_paper_folder_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.math_paper_folders(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('teacher','student')),
  subject_id uuid NOT NULL,
  level public.folder_permission_level NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(folder_id, subject_type, subject_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.math_paper_folder_permissions TO authenticated;
GRANT ALL ON public.math_paper_folder_permissions TO service_role;

ALTER TABLE public.math_paper_folder_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage folder perms" ON public.math_paper_folder_permissions;
CREATE POLICY "admins manage folder perms" ON public.math_paper_folder_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS touch_math_paper_folder_permissions ON public.math_paper_folder_permissions;
CREATE TRIGGER touch_math_paper_folder_permissions
  BEFORE UPDATE ON public.math_paper_folder_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_folder_perms_subject
  ON public.math_paper_folder_permissions(subject_type, subject_id);

-- 3. Effective permission lookup (walks up parent chain)
CREATE OR REPLACE FUNCTION public.get_effective_folder_permission(
  _folder_id uuid,
  _subject_type text,
  _subject_id uuid
) RETURNS public.folder_permission_level
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _cur uuid := _folder_id;
  _lvl public.folder_permission_level;
  _default public.folder_permission_level;
BEGIN
  IF _subject_type = 'teacher' THEN
    _default := 'upload';
  ELSE
    _default := 'none';
  END IF;

  WHILE _cur IS NOT NULL LOOP
    SELECT level INTO _lvl
      FROM public.math_paper_folder_permissions
      WHERE folder_id = _cur
        AND subject_type = _subject_type
        AND subject_id = _subject_id
      LIMIT 1;
    IF _lvl IS NOT NULL THEN
      RETURN _lvl;
    END IF;
    SELECT parent_id INTO _cur FROM public.math_paper_folders WHERE id = _cur;
  END LOOP;

  RETURN _default;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_folder_permission(uuid, text, uuid) TO authenticated;

-- 4. List all folders accessible to a student (with ancestors as structural placeholders)
CREATE OR REPLACE FUNCTION public.list_student_accessible_folders(_student_id uuid)
RETURNS TABLE(folder_id uuid, parent_id uuid, name text, level public.folder_permission_level, is_ancestor boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH grants AS (
    SELECT f.id, f.parent_id, f.name,
      public.get_effective_folder_permission(f.id, 'student', _student_id) AS lvl
    FROM public.math_paper_folders f
  ),
  visible AS (
    SELECT id, parent_id, name, lvl FROM grants WHERE lvl <> 'none'
  ),
  ancestors AS (
    SELECT DISTINCT a.id, a.parent_id, a.name
    FROM public.math_paper_folders a
    WHERE a.id IN (
      WITH RECURSIVE up(id) AS (
        SELECT v.parent_id FROM visible v WHERE v.parent_id IS NOT NULL
        UNION
        SELECT f.parent_id FROM public.math_paper_folders f
          JOIN up ON up.id = f.id
          WHERE f.parent_id IS NOT NULL
      )
      SELECT id FROM up
    )
    AND a.id NOT IN (SELECT id FROM visible)
  )
  SELECT v.id, v.parent_id, v.name, v.lvl, false FROM visible v
  UNION ALL
  SELECT a.id, a.parent_id, a.name, 'none'::public.folder_permission_level, true FROM ancestors a;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_student_accessible_folders(uuid) TO authenticated;

-- 5. Admin listing helpers
CREATE OR REPLACE FUNCTION public.list_folder_permission_overrides(_folder_id uuid)
RETURNS TABLE(id uuid, subject_type text, subject_id uuid, level public.folder_permission_level, display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION '需要管理员权限';
  END IF;
  RETURN QUERY
  SELECT p.id, p.subject_type, p.subject_id, p.level,
    CASE
      WHEN p.subject_type = 'teacher' THEN (SELECT u.email::text FROM auth.users u WHERE u.id = p.subject_id)
      WHEN p.subject_type = 'student' THEN (SELECT s.name FROM public.students s WHERE s.id = p.subject_id)
    END
  FROM public.math_paper_folder_permissions p
  WHERE p.folder_id = _folder_id
  ORDER BY p.subject_type, display_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_folder_permission_overrides(uuid) TO authenticated;
