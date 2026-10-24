import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import { generateLessonOccurrences, type CourseInfo } from "@/lib/course-schedule";

export interface MeetingSession { id: string; studentId: string; name: string; studentName: string; date: string; time: string; ambiguousDay: boolean }
export function todayShanghai() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export async function fetchMeetingSessions(date: string, ctx?: { client: SupabaseClient<Database>; uid: string }): Promise<MeetingSession[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("请选择有效日期");
  const supabase = ctx?.client ?? defaultClient;
  let uid = ctx?.uid;
  if (!uid) {
    const { data: auth, error: authError } = await defaultClient.auth.getUser();
    if (authError || !auth.user) throw new Error("请先登录 mooodle 教师账号");
    uid = auth.user.id;
  }
  const { data: roles, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", uid);
  if (roleError || !roles?.some(r => r.role === "teacher" || r.role === "admin")) throw new Error("仅教师可导入纪要");
  const { data: students, error } = await supabase.from("students").select("id,name,total_hours,hours_per_lesson,hourly_rate,schedule_start_date,schedule_slots,schedule_frequency_weeks,schedule_weekday,schedule_start_time,schedule_end_time").eq("created_by", uid);
  if (error) throw error;
  const [{ data: singles, error: singleError }, { data: cancellations, error: cancelError }] = await Promise.all([
    supabase.from("single_lessons").select("id,student_id,class_name,lesson_date,start_time,end_time").eq("created_by", uid).eq("lesson_date", date),
    supabase.from("cancelled_lessons").select("student_id,lesson_at,kind").eq("created_by", uid),
  ]);
  if (singleError || cancelError) throw singleError || cancelError;
  const out: MeetingSession[] = [];
  const cancelled = (studentId: string, time: string, single: boolean) => (cancellations ?? []).some(c => c.student_id === studentId && (!single || c.kind !== "deleted") && new Date(c.lesson_at).getTime() === new Date(`${date}T${time}+08:00`).getTime());
  const names = new Map((students ?? []).map(s => [s.id, s.name]));
  for (const s of students ?? []) {
    for (const o of generateLessonOccurrences(s as unknown as CourseInfo)) {
      const day = `${o.date.getFullYear()}-${String(o.date.getMonth()+1).padStart(2,"0")}-${String(o.date.getDate()).padStart(2,"0")}`;
      if (day !== date || cancelled(s.id, o.slot.start_time, false)) continue;
      out.push({ id: `recurring:${s.id}:${date}:${o.slot.start_time}`, studentId: s.id, name: s.name, studentName: s.name, date, time: o.slot.start_time.slice(0,5), ambiguousDay: false });
    }
  }
  for (const s of singles ?? []) {
    if (!s.student_id || !names.has(s.student_id) || cancelled(s.student_id, s.start_time, true)) continue;
    out.push({ id: `single:${s.id}`, studentId: s.student_id, name: s.class_name || names.get(s.student_id) || "", studentName: names.get(s.student_id) || "", date, time: s.start_time.slice(0,5), ambiguousDay: false });
  }
  return out.sort((a,b) => a.time.localeCompare(b.time)).map(s => ({ ...s, ambiguousDay: out.filter(o => o.studentId === s.studentId).length > 1 }));
}