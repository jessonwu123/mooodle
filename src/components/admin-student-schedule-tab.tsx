import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { LessonRatingDialog } from "@/components/lesson-rating-dialog";
import {
  type CourseInfo,
  type ScheduleSlot,
  generateLessonOccurrences,
  lessonKey,
  WEEKDAY_LABELS,
} from "@/lib/course-schedule";

interface Props {
  studentId: string;
}

interface SingleRow {
  id: string;
  created_by: string;
  student_id: string | null;
  class_name: string | null;
  teacher_name: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  hours_per_lesson: number | null;
  hourly_rate: number | null;
  notes: string | null;
}

type CalendarItem =
  | {
      kind: "recurring";
      key: string;
      date: Date;
      slot: ScheduleSlot;
      end: Date | null;
      title: string;
    }
  | {
      kind: "single";
      key: string;
      date: Date;
      end: Date;
      title: string;
      row: SingleRow;
      isSelfCreated: boolean;
    };

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function AdminStudentScheduleTab({ studentId }: Props) {
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [singles, setSingles] = useState<SingleRow[]>([]);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [creatorEmails, setCreatorEmails] = useState<Record<string, string>>({});
  const [studentOwnerId, setStudentOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "month">("month");
  const [anchor, setAnchor] = useState(new Date());
  const [detail, setDetail] = useState<CalendarItem | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingRefresh, setRatingRefresh] = useState(0);
  const [ratedDates, setRatedDates] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: stu }, { data: sng }, { data: cans }] = await Promise.all([
      supabase
        .from("students")
        .select(
          "created_by, total_hours, hours_per_lesson, hourly_rate, schedule_start_date, schedule_slots, schedule_frequency_weeks, schedule_weekday, schedule_start_time, schedule_end_time",
        )
        .eq("id", studentId)
        .maybeSingle(),
      supabase
        .from("single_lessons")
        .select("*")
        .eq("student_id", studentId)
        .order("lesson_date", { ascending: false }),
      supabase
        .from("cancelled_lessons")
        .select("lesson_at")
        .eq("student_id", studentId),
    ]);
    setCourse(stu ? (stu as unknown as CourseInfo) : null);
    setStudentOwnerId((stu as { created_by?: string } | null)?.created_by ?? null);
    setSingles((sng ?? []) as SingleRow[]);
    const set = new Set<string>();
    for (const c of cans ?? []) {
      set.add(new Date(c.lesson_at as string).toISOString());
    }
    setCancelled(set);

    // Fetch creator emails for single lessons (admin only)
    const rows = (sng ?? []) as SingleRow[];
    const ownerId = (stu as { created_by?: string } | null)?.created_by ?? null;
    const uids = Array.from(
      new Set(
        [...rows.map((r) => r.created_by), ownerId].filter(
          (x): x is string => !!x,
        ),
      ),
    );
    if (uids.length > 0) {
      const { data: teachers } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data:
          | { user_id: string; email: string; display_name: string | null }[]
          | null;
      }>)("list_teacher_display_info", { _user_ids: uids });
      const map: Record<string, string> = {};
      for (const t of teachers ?? []) {
        if (uids.includes(t.user_id)) {
          map[t.user_id] = t.display_name?.trim() || t.email;
        }
      }
      setCreatorEmails(map);
    } else {
      setCreatorEmails({});
    }

    const { data: rr } = await supabase
      .from("ratings")
      .select("lesson_date")
      .eq("student_id", studentId);
    const rset = new Set<string>();
    for (const r of (rr ?? []) as { lesson_date: string }[]) {
      rset.add(r.lesson_date);
    }
    setRatedDates(rset);

    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load, ratingRefresh]);

  const ownerTeacherDisplay = useMemo(() => {
    const name = studentOwnerId ? creatorEmails[studentOwnerId] : null;
    if (!name) return "老师";
    if (name.includes("@")) return name.slice(0, name.indexOf("@"));
    return name;
  }, [creatorEmails, studentOwnerId]);

  const items: CalendarItem[] = useMemo(() => {
    const out: CalendarItem[] = [];
    if (course) {
      for (const o of generateLessonOccurrences(course)) {
        if (cancelled.has(lessonKey(o.date))) continue;
        const end = o.slot.end_time
          ? (() => {
              const [h, m] = o.slot.end_time!.split(":").map(Number);
              const d = new Date(o.date);
              d.setHours(h, m, 0, 0);
              return d;
            })()
          : null;
        out.push({
          kind: "recurring",
          key: `r-${o.date.toISOString()}`,
          date: o.date,
          slot: o.slot,
          end,
          title: `${ownerTeacherDisplay} 老师`,
        });
      }
    }
    for (const r of singles) {
      const [y, m, d] = r.lesson_date.split("-").map(Number);
      const [h, mm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      const start = new Date(y, m - 1, d, h, mm, 0);
      const end = new Date(y, m - 1, d, eh, em, 0);
      const isSelfCreated = !!studentOwnerId && r.created_by !== studentOwnerId;
      const title =
        r.class_name ??
        (r.teacher_name
          ? `${r.teacher_name} 老师`
          : isSelfCreated
            ? "学生自建课"
            : `${ownerTeacherDisplay} 老师`);
      out.push({
        kind: "single",
        key: `s-${r.id}`,
        date: start,
        end,
        title,
        row: r,
        isSelfCreated,
      });
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [course, singles, cancelled, studentOwnerId, ownerTeacherDisplay]);

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

  const inRange = items.filter((o) => o.date >= rangeStart && o.date < rangeEnd);

  const totalHours = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      if (it.kind === "single") {
        if (it.row.hours_per_lesson != null) {
          sum += Number(it.row.hours_per_lesson);
        } else {
          sum += (it.end.getTime() - it.date.getTime()) / 3600000;
        }
      } else {
        if (course?.hours_per_lesson) {
          sum += Number(course.hours_per_lesson);
        } else if (it.end) {
          sum += (it.end.getTime() - it.date.getTime()) / 3600000;
        }
      }
    }
    return Math.round(sum * 100) / 100;
  }, [items, course]);

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

  const shift = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            学生课程表
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {label}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        <div className="-mx-4 overflow-x-auto px-4"><div className="grid min-w-[770px] grid-cols-[repeat(7,minmax(110px,1fr))] gap-2">
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {days.map((d, i) => {
            const dayItems = inRange
              .filter((o) => sameDay(o.date, d))
              .sort((a, b) => a.date.getTime() - b.date.getTime());
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
                  {dayItems.map((it) => {
                    const timeStr = fmtTime(it.date);
                    const isSelf = it.kind === "single" && it.isSelfCreated;
                    const cls =
                      it.kind === "recurring"
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : isSelf
                          ? "bg-sky-100 text-sky-800 hover:bg-sky-200"
                          : "bg-amber-100 text-amber-800 hover:bg-amber-200";
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => setDetail(it)}
                        className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] ${cls}`}
                        title={`${it.title} ${timeStr}`}
                      >
                        <span className="font-medium">{timeStr}</span> {it.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div></div>

      )}

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>课次详情</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <Row
                label="类型"
                value={
                  detail.kind === "recurring"
                    ? "固定课程（来自课程信息）"
                    : detail.isSelfCreated
                      ? "学生自建单次课程"
                      : "教师安排的单次课程"
                }
              />
              <Row
                label="日期"
                value={detail.date.toLocaleDateString("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                })}
              />
              <Row
                label="时间"
                value={
                  detail.kind === "recurring"
                    ? `${detail.slot.start_time.slice(0, 5)}${detail.slot.end_time ? "-" + detail.slot.end_time.slice(0, 5) : ""}`
                    : `${fmtTime(detail.date)}-${fmtTime(detail.end)}`
                }
              />
              {detail.kind === "single" && (
                <>
                  {detail.row.class_name && (
                    <Row label="课程名称" value={detail.row.class_name} />
                  )}
                  {detail.row.teacher_name && (
                    <Row label="老师" value={detail.row.teacher_name} />
                  )}
                  {detail.row.hours_per_lesson != null && (
                    <Row
                      label="课时"
                      value={`${detail.row.hours_per_lesson} 小时`}
                    />
                  )}
                  {detail.row.hourly_rate != null && (
                    <Row
                      label="单价"
                      value={`¥${detail.row.hourly_rate} / 小时`}
                    />
                  )}
                  {detail.row.notes && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        备注
                      </div>
                      <div className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm">
                        {detail.row.notes}
                      </div>
                    </div>
                  )}
                  <Row
                    label="创建者"
                    value={
                      creatorEmails[detail.row.created_by] ??
                      (detail.isSelfCreated ? "学生本人" : "教师")
                    }
                  />
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setRatingOpen(true)}
              disabled={!detail}
              className="gap-1.5"
            >
              <ClipboardList className="h-4 w-4" />
              {detail && ratedDates.has(fmtDateISO(detail.date)) ? "查看/编辑评分" : "新增课堂评分"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail && (
        <LessonRatingDialog
          open={ratingOpen}
          onOpenChange={setRatingOpen}
          studentId={studentId}
          lessonDate={fmtDateISO(detail.date)}
          editable={true}
          onSaved={() => setRatingRefresh((n) => n + 1)}
        />
      )}
    </div>
  );
}

function fmtDateISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{value}</span>
    </div>
  );
}
