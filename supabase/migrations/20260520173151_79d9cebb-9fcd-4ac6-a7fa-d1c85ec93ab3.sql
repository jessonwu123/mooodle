
CREATE OR REPLACE FUNCTION public.student_login_email(_username text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  SELECT u.email::text INTO _email
  FROM public.students s
  JOIN auth.users u ON u.id = s.auth_user_id
  WHERE lower(s.username) = lower(_username)
  LIMIT 1;
  RETURN _email;
END;
$$;

REVOKE ALL ON FUNCTION public.student_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_login_email(text) TO anon, authenticated;
