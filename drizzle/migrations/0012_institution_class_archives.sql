ALTER TABLE public.students ADD COLUMN archive_kind text NOT NULL DEFAULT 'student';
ALTER TABLE public.students ADD COLUMN institution_class_key text;
CREATE UNIQUE INDEX students_institution_class_unique ON public.students(created_by, institution_class_key) WHERE archive_kind = 'institution_class';
ALTER TABLE public.imported_lessons ADD COLUMN archive_student_id uuid REFERENCES public.students(id);
CREATE INDEX imported_lessons_archive_student_idx ON public.imported_lessons(archive_student_id, lesson_date);
CREATE OR REPLACE FUNCTION public.link_institution_class_archive() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_key text;
BEGIN
 v_key := btrim(NEW.class_name);
 IF v_key = '' THEN RETURN NEW; END IF;
 INSERT INTO public.students(name, created_by, archive_kind, institution_class_key) VALUES (v_key, NEW.created_by, 'institution_class', v_key)
 ON CONFLICT (created_by, institution_class_key) WHERE archive_kind = 'institution_class' DO UPDATE SET institution_class_key = EXCLUDED.institution_class_key RETURNING id INTO v_id;
 NEW.archive_student_id := v_id;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.link_institution_class_archive() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER link_institution_class_archive BEFORE INSERT OR UPDATE OF class_name, created_by ON public.imported_lessons FOR EACH ROW EXECUTE FUNCTION public.link_institution_class_archive();
CREATE OR REPLACE FUNCTION public.protect_institution_archive_course() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.archive_kind = 'institution_class' AND (NEW.auth_user_id IS NOT NULL OR NEW.username IS NOT NULL) THEN RAISE EXCEPTION 'Institution archives cannot have student login accounts'; END IF;
   RETURN NEW;
 END IF;
 IF OLD.archive_kind = 'institution_class' THEN
  IF ROW(NEW.name, NEW.created_by, NEW.archive_kind, NEW.institution_class_key, NEW.auth_user_id, NEW.username, NEW.total_hours, NEW.hours_per_lesson, NEW.hourly_rate, NEW.schedule_start_date, NEW.schedule_weekday, NEW.schedule_start_time, NEW.schedule_end_time, NEW.schedule_slots, NEW.schedule_frequency_weeks) IS DISTINCT FROM ROW(OLD.name, OLD.created_by, OLD.archive_kind, OLD.institution_class_key, OLD.auth_user_id, OLD.username, OLD.total_hours, OLD.hours_per_lesson, OLD.hourly_rate, OLD.schedule_start_date, OLD.schedule_weekday, OLD.schedule_start_time, OLD.schedule_end_time, OLD.schedule_slots, OLD.schedule_frequency_weeks) THEN RAISE EXCEPTION 'Institution course information is read-only'; END IF;
 ELSIF NEW.archive_kind IS DISTINCT FROM OLD.archive_kind THEN RAISE EXCEPTION 'Archive kind cannot be changed';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_institution_archive_course() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_institution_archive_course BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.protect_institution_archive_course();
INSERT INTO public.students(name, created_by, archive_kind, institution_class_key)
SELECT DISTINCT btrim(l.class_name), l.created_by, 'institution_class', btrim(l.class_name) FROM public.imported_lessons l WHERE btrim(l.class_name) <> '' AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = l.created_by AND r.role = 'admin')
ON CONFLICT (created_by, institution_class_key) WHERE archive_kind = 'institution_class' DO NOTHING;
UPDATE public.imported_lessons l SET archive_student_id = s.id FROM public.students s WHERE s.archive_kind = 'institution_class' AND s.created_by = l.created_by AND s.institution_class_key = btrim(l.class_name);
COMMENT ON COLUMN public.students.archive_kind IS 'Institution classes reuse assessment storage without student auth accounts; imported_lessons remain the sole course source.';