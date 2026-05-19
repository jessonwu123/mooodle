export interface CourseInfo {
  total_hours: number | null;
  hours_per_lesson: number | null;
  schedule_start_date: string | null; // YYYY-MM-DD
  schedule_weekday: number | null; // 0=Sun..6=Sat
  schedule_start_time: string | null; // HH:MM:SS
  schedule_end_time: string | null;
}

export function totalLessonCount(c: Pick<CourseInfo, "total_hours" | "hours_per_lesson">): number {
  if (!c.total_hours || !c.hours_per_lesson || c.hours_per_lesson <= 0) return 0;
  return Math.ceil(c.total_hours / c.hours_per_lesson);
}

export const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** Generate lesson Date instances (start datetime) for the student's recurring schedule. */
export function generateLessonDates(c: CourseInfo): Date[] {
  const count = totalLessonCount(c);
  if (
    !count ||
    !c.schedule_start_date ||
    c.schedule_weekday == null ||
    !c.schedule_start_time
  ) {
    return [];
  }
  const [y, m, d] = c.schedule_start_date.split("-").map(Number);
  const [hh, mm] = c.schedule_start_time.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  // shift forward to first matching weekday on or after start
  const diff = (c.schedule_weekday - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + diff);
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i * 7);
    out.push(dt);
  }
  return out;
}

export function formatTimeRange(start: string | null, end: string | null): string {
  const f = (t: string | null) => (t ? t.slice(0, 5) : "");
  if (!start) return "";
  return end ? `${f(start)}-${f(end)}` : f(start);
}
