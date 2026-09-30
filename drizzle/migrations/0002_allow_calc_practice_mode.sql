DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass AS t, conname FROM pg_constraint
    WHERE conrelid IN ('public.student_practice_sessions'::regclass,'public.student_question_attempt_log'::regclass)
      AND contype='c' AND pg_get_constraintdef(oid) LIKE '%mode%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.t, r.conname);
  END LOOP;
END $$;
ALTER TABLE public.student_practice_sessions ADD CONSTRAINT student_practice_sessions_mode_check CHECK (mode IN ('paper','targeted','ai','calc'));
ALTER TABLE public.student_question_attempt_log ADD CONSTRAINT student_question_attempt_log_mode_check CHECK (mode IN ('paper','targeted','ai','calc'));