-- 默认权限表：folder_id -> level，对所有"学生"主体生效
CREATE TABLE IF NOT EXISTS public.math_paper_folder_default_permissions (
  folder_id uuid PRIMARY KEY REFERENCES public.math_paper_folders(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('student','teacher')),
  level public.folder_permission_level NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.math_paper_folder_default_permissions TO authenticated;
GRANT ALL ON public.math_paper_folder_default_permissions TO service_role;

ALTER TABLE public.math_paper_folder_default_permissions ENABLE ROW LEVEL SECURITY;

-- 仅通过 SECURITY DEFINER 函数访问；不开放直接读写
-- (无策略 = 默认拒绝)

-- 修改有效权限函数：在每一层先看 override，再看默认
CREATE OR REPLACE FUNCTION public.get_effective_folder_permission(
  _folder_id uuid, _subject_type text, _subject_id uuid
) RETURNS folder_permission_level
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- 1. 个人/账号级 override
    SELECT level INTO _lvl
      FROM public.math_paper_folder_permissions
      WHERE folder_id = _cur
        AND subject_type = _subject_type
        AND subject_id = _subject_id
      LIMIT 1;
    IF _lvl IS NOT NULL THEN
      RETURN _lvl;
    END IF;

    -- 2. 该文件夹对该主体类型的默认权限
    SELECT level INTO _lvl
      FROM public.math_paper_folder_default_permissions
      WHERE folder_id = _cur
        AND subject_type = _subject_type
      LIMIT 1;
    IF _lvl IS NOT NULL THEN
      RETURN _lvl;
    END IF;

    SELECT parent_id INTO _cur FROM public.math_paper_folders WHERE id = _cur;
  END LOOP;

  RETURN _default;
END;
$function$;

-- 为 AMC8 → 题目 文件夹设置默认下载权限（所有学生可见+下载，可在习题练习中刷该卷）
INSERT INTO public.math_paper_folder_default_permissions (folder_id, subject_type, level)
VALUES ('bb13aacd-d643-421a-9ed1-909dea9154fe', 'student', 'download')
ON CONFLICT (folder_id) DO UPDATE SET level = EXCLUDED.level, updated_at = now();