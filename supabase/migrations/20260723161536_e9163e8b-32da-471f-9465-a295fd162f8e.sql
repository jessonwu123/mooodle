CREATE OR REPLACE FUNCTION public.list_teacher_display_info(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text, display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '需要管理员权限';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text,
      COALESCE(
        NULLIF(u.raw_user_meta_data->>'display_name',''),
        NULLIF(u.raw_user_meta_data->>'full_name',''),
        NULLIF(u.raw_user_meta_data->>'name','')
      )
    FROM auth.users u
    WHERE u.id = ANY(_user_ids);
END;
$$;