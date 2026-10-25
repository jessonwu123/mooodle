CREATE OR REPLACE FUNCTION public.protect_student_account_creator() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.account_created_by IS NOT NULL AND current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION '账号创建者只能由服务记录'; END IF;
 ELSE
  IF NEW.account_created_by IS DISTINCT FROM OLD.account_created_by THEN
   IF current_user NOT IN ('service_role','postgres') OR OLD.account_created_by IS NOT NULL THEN RAISE EXCEPTION '账号创建者不可修改'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_student_account_creator BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.protect_student_account_creator();