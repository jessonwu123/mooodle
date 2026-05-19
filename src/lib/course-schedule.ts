export interface ScheduleSlot {
  weekday: number; // 0=Sun..6=Sat
  start_time: string; // HH:MM:SS
  end_time: string | null;
}

export interface CourseInfo {
  total_hours: number | null;
  hours_per_lesson: number | null;
  hourly_rate: number | null; // 课时费：每小时多少钱
  schedule_start_date: string | null; // YYYY-MM-DD
  schedule_slots: ScheduleSlot[] | null;
  schedule_frequency_weeks: number | null; // every N weeks; default 1
  // Legacy single-slot fields (kept for backward compat reads)
  schedule_weekday?: number | null;
  schedule_start_time?: string | null;
  schedule_end_time?: string | null;
}

export const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function totalLessonCount(
  c: Pick<CourseInfo, "total_hours" | "hours_per_lesson">,
): number {
  if (!c.total_hours || !c.hours_per_lesson || c.hours_per_lesson <= 0) return 0;
  return Math.ceil(c.total_hours / c.hours_per_lesson);
}

/** 总课时费 = 总课时 × 课时费（每小时） */
export function totalCourseFee(
  c: Pick<CourseInfo, "total_hours" | "hourly_rate">,
): number {
  if (!c.total_hours || !c.hourly_rate || c.hourly_rate <= 0) return 0;
  return Math.round(c.total_hours * c.hourly_rate * 100) / 100;
}

/** 单次课收入 = 每节课时长 × 课时费 */
export function lessonFee(
  hoursPerLesson: number | null,
  hourlyRate: number | null,
): number {
  if (!hoursPerLesson || !hourlyRate || hourlyRate <= 0) return 0;
  return Math.round(hoursPerLesson * hourlyRate * 100) / 100;
}

/** Normalize slots: prefer schedule_slots, fall back to legacy single slot. */
export function effectiveSlots(c: CourseInfo): ScheduleSlot[] {
  if (c.schedule_slots && c.schedule_slots.length > 0) {
    return [...c.schedule_slots].sort(
      (a, b) =>
        a.weekday - b.weekday ||
        (a.start_time ?? "").localeCompare(b.start_time ?? ""),
    );
  }
  if (c.schedule_weekday != null && c.schedule_start_time) {
    return [
      {
        weekday: c.schedule_weekday,
        start_time: c.schedule_start_time,
        end_time: c.schedule_end_time ?? null,
      },
    ];
  }
  return [];
}

export interface LessonOccurrence {
  date: Date;
  slot: ScheduleSlot;
}

/**
 * Generate lesson occurrences (datetime + slot) for the student's recurring schedule.
 * Repeats every `schedule_frequency_weeks` weeks (default 1) until total lesson count reached.
 */
export function generateLessonOccurrences(c: CourseInfo): LessonOccurrence[] {
  const count = totalLessonCount(c);
  const slots = effectiveSlots(c);
  if (!count || !c.schedule_start_date || slots.length === 0) return [];

  const freq = Math.max(1, c.schedule_frequency_weeks ?? 1);
  const [y, m, d] = c.schedule_start_date.split("-").map(Number);
  const base = new Date(y, m - 1, d, 0, 0, 0);

  const out: LessonOccurrence[] = [];
  let week = 0;
  while (out.length < count) {
    // For each cycle (every freq weeks), iterate slots in weekday order
    for (const s of slots) {
      const day = new Date(base);
      const diff = (s.weekday - base.getDay() + 7) % 7;
      day.setDate(base.getDate() + diff + week * 7);
      const [hh, mm] = s.start_time.split(":").map(Number);
      day.setHours(hh, mm, 0, 0);
      if (day < base) continue;
      out.push({ date: day, slot: s });
      if (out.length >= count) break;
    }
    week += freq;
    if (week > count * freq * 7) break; // safety
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Backward-compatible helper returning just Date list. */
export function generateLessonDates(c: CourseInfo): Date[] {
  return generateLessonOccurrences(c).map((o) => o.date);
}

export function formatTimeRange(start: string | null, end: string | null): string {
  const f = (t: string | null) => (t ? t.slice(0, 5) : "");
  if (!start) return "";
  return end ? `${f(start)}-${f(end)}` : f(start);
}

/** ISO key for a lesson occurrence date — used to match cancelled lessons. */
export function lessonKey(d: Date): string {
  return d.toISOString();
}
