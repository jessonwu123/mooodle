DROP FUNCTION IF EXISTS public.list_all_teachers();

CREATE OR REPLACE FUNCTION public.list_all_teachers()
RETURNS TABLE(
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean,
  is_teacher boolean,
  student_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '需要管理员权限';
  END IF;
  RETURN QUERY
    SELECT
      u.id,
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'),
      EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'teacher'),
      (SELECT count(*) FROM public.students s WHERE s.created_by = u.id)
    FROM auth.users u
    WHERE u.email IS NULL OR lower(u.email) NOT LIKE '%@student.local'
    ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_user_login_history(_user_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(
  occurred_at timestamptz,
  action text,
  ip_address text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '需要管理员权限';
  END IF;
  RETURN QUERY
    SELECT
      a.created_at,
      (a.payload->>'action')::text,
      a.ip_address::text
    FROM auth.audit_log_entries a
    WHERE (a.payload->>'actor_id')::uuid = _user_id
      AND (a.payload->>'action') IN (
        'login','logout','token_refreshed','user_signedup',
        'user_recovery_requested','user_modified','user_repeated_signup'
      )
    ORDER BY a.created_at DESC
    LIMIT GREATEST(_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_user_login_history(uuid, int) TO authenticated;