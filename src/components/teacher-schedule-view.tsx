import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScheduleExportDialog,
  type ExportEntry,
} from "@/components/schedule-export-dialog";
import {
  type CourseInfo,
  generateLessonOccurrences,
  lessonKey,
  WEEKDAY_LABELS,
} from "@/lib/course-schedule";

interface Props {
  teacherId: string;
  teacherLabel?: string;
}

interface StudentRow extends CourseInfo {
  id: string;
  name: string;
}

interface Item {
  date: Date;
  end: Date | null;
  title: string;
  hours: number;
  tone: "recurring" | "single" | "imported";
  groupKey: string;
  groupLabel: string;
}

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmt(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TeacherScheduleView({ teacherId, teacherLabel }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "month">("month");
  const [anchor, setAnchor] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const { data: studentRows } = await supabase
      .from("students")
      .select(
        "id, name, total_hours, hours_per_lesson, hourly_rate, schedule_start_date, schedule_slots, schedule_frequency_weeks, schedule_weekday, schedule_start_time, schedule_end_time",
      )
      .eq("created_by", teacherId);
    const students = (studentRows ?? []) as unknown as StudentRow[];
    const studentIds = students.map((s) => s.id);

    const [{ data: singles }, { data: imported }, { data: cans }] =
      await Promise.all([
        supabase.from("single_lessons").select("*").eq("created_by", teacherId),
        supabase
          .from("imported_lessons")
          .select("*")
          .eq("created_by", teacherId),
        studentIds.length
          ? supabase
              .from("cancelled_lessons")
              .select("lesson_at, student_id")
              .in("student_id", studentIds)
          : Promise.resolve({ data: [] as { lesson_at: string }[] }),
      ]);

    const cancelled = new Set<string>();
    for (const c of (cans ?? []) as { lesson_at: string }[]) {
      cancelled.add(new Date(c.lesson_at).toISOString());
    }

    const out: Item[] = [];

    for (const s of students) {
      for (const o of generateLessonOccurrences(s)) {
        if (cancelled.has(lessonKey(o.date))) continue;
        let end: Date | null = null;
        if (o.slot.end_time) {
          const [h, m] = o.slot.end_time.split(":").map(Number);
          const e = new Date(o.date);
          e.setHours(h, m, 0, 0);
          end = e;
        }
        out.push({
          date: o.date,
          end,
          title: s.name,
          hours:
            Number(s.hours_per_lesson ?? 0) ||
            (end ? (end.getTime() - o.date.getTime()) / 3600000 : 0),
          tone: "recurring",
          groupKey: s.id,
          groupLabel: s.name,
        });
      }
    }

    const nameById = new Map(students.map((s) => [s.id, s.name]));
    for (const r of (singles ?? []) as Array<{
      id: string;
      student_id: string | null;
      class_name: string | null;
      lesson_date: string;
      start_time: string;
      end_time: string;
      hours_per_lesson: number | null;
    }>) {
      const [y, m, d] = r.lesson_date.split("-").map(Number);
      const [h, mm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      const start = new Date(y, m - 1, d, h, mm);
      const end = new Date(y, m - 1, d, eh, em);
      const title =
        (r.student_id ? nameById.get(r.student_id) : null) ??
        r.class_name ??
        "单次课";
      out.push({
        date: start,
        end,
        title,
        hours:
          Number(r.hours_per_lesson ?? 0) ||
          (end.getTime() - start.getTime()) / 3600000,
        tone: "single",
        groupKey: r.student_id ?? "__other__",
        groupLabel: title,
      });
    }

    for (const r of (imported ?? []) as Array<{
      id: string;
      lesson_date: string;
      start_time: string;
      end_time: string;
      class_name: string;
    }>) {
      const [y, m, d] = r.lesson_date.split("-").map(Number);
      const [h, mm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      const start = new Date(y, m - 1, d, h, mm);
      const end = new Date(y, m - 1, d, eh, em);
      out.push({
        date: start,
        end,
        title: r.class_name,
        hours: (end.getTime() - start.getTime()) / 3600000,
        tone: "imported",
        groupKey: "__imported__",
        groupLabel: "导入课表",
      });
    }

    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    setItems(out);
    setLoading(false);
  }, [teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { rangeStart, rangeEnd, days, label } = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      const ds = Array.from({ length: 7 }, (_, i) => {
        const x = new Date(s);
        x.setDate(s.getDate() + i);
        return x;
      });
      return {
        rangeStart: s,
        rangeEnd: e,
        days: ds,
        label: `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 起的一周`,
      };
    }
    const s = startOfMonth(anchor);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    const gridStart = startOfWeek(s);
    const ds: Date[] = [];
    const cur = new Date(gridStart);
    while (cur < e || ds.length % 7 !== 0) {
      ds.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
      if (ds.length > 42) break;
    }
    return {
      rangeStart: s,
      rangeEnd: e,
      days: ds,
      label: `${s.getFullYear()}年${s.getMonth() + 1}月`,
    };
  }, [view, anchor]);

  const inRange = items.filter((o) => o.date >= rangeStart && o.date < rangeEnd);
  const rangeHours =
    Math.round(inRange.reduce((s, i) => s + i.hours, 0) * 100) / 100;

  const exportEntries: ExportEntry[] = useMemo(
    () =>
      items.map((it) => ({
        date: it.date,
        timeLabel: `${fmt(it.date)}${it.end ? `-${fmt(it.end)}` : ""}`,
        title: it.title,
        groupKey: it.groupKey,
        groupLabel: it.groupLabel,
      })),
    [items],
  );

  const shift = (dir: number) => {
    const d = new Date(anchor);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            {teacherLabel ? `${teacherLabel} 的课程表` : "课程表"}
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">
            {view === "week" ? "本周" : "本月"}共 {inRange.length} 节课 ·{" "}
            {rangeHours} 小时
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScheduleExportDialog entries={exportEntries} />
          <Tabs value={view} onValueChange={(v) => setView(v as "week" | "month")}>
            <TabsList>
              <TabsTrigger value="week">周</TabsTrigger>
              <TabsTrigger value="month">月</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            今天
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="grid min-w-[770px] grid-cols-[repeat(7,minmax(110px,1fr))] gap-2">
            {WEEKDAY_LABELS.map((w) => (
              <div
                key={w}
                className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
              >
                {w}
              </div>
            ))}
            {days.map((d, i) => {
              const dayItems = items.filter((o) => sameDay(o.date, d));
              const inCurrentRange = d >= rangeStart && d < rangeEnd;
              const isToday = sameDay(d, new Date());
              return (
                <div
                  key={i}
                  className={`min-h-[100px] rounded-xl border p-2 ${
                    inCurrentRange
                      ? "border-border bg-card"
                      : "border-border/40 bg-muted/20 text-muted-foreground"
                  } ${isToday ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="mb-1 text-xs font-medium">{d.getDate()}</div>
                  <div className="space-y-1">
                    {dayItems.map((o, j) => {
                      const time = `${fmt(o.date)}${o.end ? `-${fmt(o.end)}` : ""}`;
                      const tone =
                        o.tone === "recurring"
                          ? "bg-primary/10 text-primary"
                          : o.tone === "single"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-amber-100 text-amber-800";
                      return (
                        <div
                          key={j}
                          className={`rounded-md px-1.5 py-1 text-[11px] ${tone}`}
                          title={`${o.title} ${time}`}
                        >
                          <div className="font-medium whitespace-nowrap">{time}</div>
                          <div className="truncate">{o.title}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && inRange.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          该时间段内没有课程
        </div>
      )}
    </div>
  );
}
