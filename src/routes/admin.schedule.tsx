import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type CourseInfo,
  type ScheduleSlot,
  generateLessonOccurrences,
  WEEKDAY_LABELS,
  lessonKey,
} from "@/lib/course-schedule";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/schedule")({
  component: SchedulePage,
});

interface StudentRow extends CourseInfo {
  id: string;
  name: string;
}

interface Occurrence {
  date: Date;
  slot: ScheduleSlot;
  student: StudentRow;
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

function SchedulePage() {
  const { session } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    setLoading(true);
    const [{ data: studs }, { data: cancels }] = await Promise.all([
      supabase
        .from("students")
        .select(
          "id, name, total_hours, hours_per_lesson, schedule_start_date, schedule_slots, schedule_frequency_weeks, schedule_weekday, schedule_start_time, schedule_end_time",
        )
        .eq("created_by", session.user.id),
      supabase.from("cancelled_lessons").select("student_id, lesson_at"),
    ]);
    setStudents((studs ?? []) as unknown as StudentRow[]);
    const set = new Set<string>();
    for (const c of cancels ?? []) {
      set.add(
        `${c.student_id}|${new Date(c.lesson_at as string).toISOString()}`,
      );
    }
    setCancelled(set);
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const occurrences: Occurrence[] = useMemo(() => {
    const out: Occurrence[] = [];
    for (const s of students) {
      for (const o of generateLessonOccurrences(s)) {
        const key = `${s.id}|${lessonKey(o.date)}`;
        if (cancelled.has(key)) continue;
        out.push({ date: o.date, slot: o.slot, student: s });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [students, cancelled]);

  const { rangeStart, rangeEnd, label } = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      return {
        rangeStart: s,
        rangeEnd: e,
        label: `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 起的一周`,
      };
    }
    const s = startOfMonth(anchor);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return {
      rangeStart: s,
      rangeEnd: e,
      label: `${s.getFullYear()}年${s.getMonth() + 1}月`,
    };
  }, [view, anchor]);

  const inRange = occurrences.filter(
    (o) => o.date >= rangeStart && o.date < rangeEnd,
  );

  const shift = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const handleCancelLesson = async (o: Occurrence) => {
    if (!confirm(`确认删除 ${o.student.name} 在 ${o.date.toLocaleString("zh-CN")} 的这节课？`))
      return;
    const { error } = await supabase.from("cancelled_lessons").insert({
      student_id: o.student.id,
      lesson_at: o.date.toISOString(),
      created_by: session?.user.id ?? null,
    });
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除该节课");
    setCancelled((prev) =>
      new Set(prev).add(`${o.student.id}|${lessonKey(o.date)}`),
    );
  };

  const days: Date[] = [];
  if (view === "week") {
    for (let i = 0; i < 7; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      days.push(d);
    }
  } else {
    const gridStart = startOfWeek(rangeStart);
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
      if (i >= 27 && d >= rangeEnd && d.getDay() === 6) break;
    }
  }

  return (
    <div>
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回学生列表
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            课程表
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {label}
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">
            本{view === "week" ? "周" : "月"}共 {inRange.length} 节课
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "week" | "month")}>
            <TabsList>
              <TabsTrigger value="week">周视图</TabsTrigger>
              <TabsTrigger value="month">月视图</TabsTrigger>
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
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {days.map((d, i) => {
            const dayOcc = inRange.filter((o) => sameDay(o.date, d));
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
                  {dayOcc.map((o, j) => (
                    <Link
                      key={j}
                      to="/admin/student/$id"
                      params={{ id: o.student.id }}
                      className="block truncate rounded-md bg-primary/10 px-1.5 py-1 text-[11px] text-primary hover:bg-primary/20"
                      title={`${o.student.name} ${o.slot.start_time?.slice(0, 5) ?? ""}${o.slot.end_time ? "-" + o.slot.end_time.slice(0, 5) : ""}`}
                    >
                      <span className="font-medium">
                        {o.slot.start_time?.slice(0, 5)}
                      </span>{" "}
                      {o.student.name}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && inRange.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-foreground">课程列表</h2>
          <div className="space-y-2">
            {inRange.map((o, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)]"
              >
                <Link
                  to="/admin/student/$id"
                  params={{ id: o.student.id }}
                  className="flex-1"
                >
                  <div className="text-sm font-medium text-foreground">
                    {o.student.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.date.toLocaleDateString("zh-CN", {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}{" "}
                    · {o.slot.start_time?.slice(0, 5)}
                    {o.slot.end_time ? "-" + o.slot.end_time.slice(0, 5) : ""}
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCancelLesson(o)}
                  className="text-muted-foreground hover:text-destructive"
                  title="删除该节课"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
