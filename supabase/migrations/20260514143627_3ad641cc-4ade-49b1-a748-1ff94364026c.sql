-- 1. 增加 teacher 角色
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher';