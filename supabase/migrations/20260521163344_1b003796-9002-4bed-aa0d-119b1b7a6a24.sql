CREATE OR REPLACE FUNCTION public.list_all_teachers()
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone, is_admin boolean, is_teacher boolean, student_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '需要管理员权限';
  END IF;
  RETURN QUERY
    SELECT
      u.id,
      u.email::text,
      u.created_at,
      EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'),
      EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'teacher'),
      (SELECT count(*) FROM public.students s WHERE s.created_by = u.id)
    FROM auth.users u
    WHERE u.email IS NULL OR lower(u.email) NOT LIKE '%@student.local'
    ORDER BY u.created_at DESC;
END;
$function$;