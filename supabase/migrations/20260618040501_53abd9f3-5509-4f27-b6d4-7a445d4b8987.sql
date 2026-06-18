CREATE OR REPLACE FUNCTION public.list_student_accessible_folders(_student_id uuid)
RETURNS TABLE(folder_id uuid, parent_id uuid, name text, level public.folder_permission_level, is_ancestor boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH grants AS (
    SELECT f.id AS folder_id, f.parent_id AS folder_parent_id, f.name AS folder_name,
      public.get_effective_folder_permission(f.id, 'student', _student_id) AS lvl
    FROM public.math_paper_folders f
  ),
  visible AS (
    SELECT g.folder_id, g.folder_parent_id, g.folder_name, g.lvl FROM grants g WHERE g.lvl <> 'none'
  ),
  ancestors AS (
    SELECT DISTINCT a.id AS ancestor_id, a.parent_id AS ancestor_parent_id, a.name AS ancestor_name
    FROM public.math_paper_folders a
    WHERE a.id IN (
      WITH RECURSIVE up(id) AS (
        SELECT v.folder_parent_id FROM visible v WHERE v.folder_parent_id IS NOT NULL
        UNION
        SELECT f.parent_id FROM public.math_paper_folders f
          JOIN up ON up.id = f.id
          WHERE f.parent_id IS NOT NULL
      )
      SELECT up.id FROM up
    )
    AND a.id NOT IN (SELECT v.folder_id FROM visible v)
  )
  SELECT v.folder_id, v.folder_parent_id, v.folder_name, v.lvl, false FROM visible v
  UNION ALL
  SELECT a.ancestor_id, a.ancestor_parent_id, a.ancestor_name, 'none'::public.folder_permission_level, true FROM ancestors a;
END;
$function$;