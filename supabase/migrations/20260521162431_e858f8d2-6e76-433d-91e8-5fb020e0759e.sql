-- 修复 bug：触发器原本给所有新 auth 用户都加 teacher 角色，
-- 导致老师创建的学生账号（@student.local）也被当成教师。
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 学生内部账号（@student.local）不应被授予教师/管理员角色
  IF NEW.email IS NOT NULL AND lower(NEW.email) LIKE '%@student.local' THEN
    RETURN NEW;
  END IF;

  -- 如果还没有任何 admin，将该用户设为 admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  -- 同时设置为 teacher
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 清理：删除已被错误授予角色的学生账号
DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id
  AND lower(u.email) LIKE '%@student.local';
