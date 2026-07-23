import { supabase } from "@/integrations/supabase/client";
import {
  type CourseInfo,
  generateLessonOccurrences,
  lessonKey,
} from "@/lib/course-schedule";

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export interface StudentLessonOption {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM or HH:MM-HH:MM */
  time: string;
  label: string;
  className?: string | null;
  kind: "recurring" | "single";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export async function fetchStudentLessons(
  studentId: string,
): Promise<StudentLessonOption[]> {
  const [{ data: sng }, { data: stu }, { data: cans }] = await Promise.all([
    supabase.from("single_lessons").select("*").eq("student_id", studentId),
    supabase
      .from("students")
      .select(
        "total_hours, hours_per_lesson, hourly_rate, schedule_start_date, schedule_slots, schedule_frequency_weeks, schedule_weekday, schedule_start_time, schedule_end_time",
      )
      .eq("id", studentId)
      .maybeSingle(),
    supabase
      .from("cancelled_lessons")
      .select("lesson_at")
      .eq("student_id", studentId),
  ]);

  const cancelled = new Set<string>();
  for (const c of cans ?? []) {
    cancelled.add(new Date((c as { lesson_at: string }).lesson_at).toISOString());
  }

  const out: {
    date: Date;
    end: Date | null;
    className?: string | null;
    kind: "recurring" | "single";
  }[] = [];

  if (stu) {
    for (const o of generateLessonOccurrences(stu as unknown as CourseInfo)) {
      if (cancelled.has(lessonKey(o.date))) continue;
      let end: Date | null = null;
      if (o.slot.end_time) {
        const [h, m] = o.slot.end_time.split(":").map(Number);
        const e = new Date(o.date);
        e.setHours(h, m, 0, 0);
        end = e;
      }
      out.push({ date: o.date, end, kind: "recurring" });
    }
  }

  for (const r of (sng ?? []) as Array<{
    lesson_date: string;
    start_time: string;
    end_time: string;
    class_name: string | null;
  }>) {
    const [y, m, d] = r.lesson_date.split("-").map(Number);
    const [h, mm] = r.start_time.split(":").map(Number);
    const [eh, em] = r.end_time.split(":").map(Number);
    out.push({
      date: new Date(y, m - 1, d, h, mm),
      end: new Date(y, m - 1, d, eh, em),
      className: r.class_name,
      kind: "single",
    });
  }

  out.sort((a, b) => a.date.getTime() - b.date.getTime());

  return out.map((o) => {
    const d = o.date;
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const t1 = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const t2 = o.end ? `${pad(o.end.getHours())}:${pad(o.end.getMinutes())}` : "";
    const time = t2 ? `${t1}-${t2}` : t1;
    const label = `${dateStr} ${WEEKDAY[d.getDay()]} ${time}${o.className ? " · " + o.className : ""}`;
    return { date: dateStr, time, label, className: o.className, kind: o.kind };
  });
}
