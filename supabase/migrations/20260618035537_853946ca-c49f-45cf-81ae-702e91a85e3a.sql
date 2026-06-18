-- Prevent students (and any authenticated user) from reading the correct_answer column
-- directly from the attempt log. The column is still readable by service_role for
-- server-side grading/history rendering.
REVOKE SELECT (correct_answer) ON public.student_question_attempt_log FROM authenticated;
REVOKE SELECT (correct_answer) ON public.student_question_attempt_log FROM anon;