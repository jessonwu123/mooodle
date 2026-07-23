import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  type CourseInfo,
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
      ref: string;
      date: Date;
      end: Date | null;
      title: string;
    }
  | {
      kind: "single-teacher";
      key: string;
      ref: string;
      date: Date;
      end: Date;
      title: string;
      row: SingleRow;
    }
  | {
      kind: "single-self";
      key: string;
      date: Date;
      end: Date;
      title: string;
      row: SingleRow;
    };

function teacherDisplayName(email: string | null | undefined): string {
  if (!email) return "老师";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

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
const today = () => new Date().toISOString().slice(0, 10);

export function StudentScheduleTab({ studentId }: Props) {
  const { session } = useAuth();
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [singles, setSingles] = useState<SingleRow[]>([]);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "month">("month");
  const [anchor, setAnchor] = useState(new Date());
  const [teacherEmail, setTeacherEmail] = useState<string | null>(null);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SingleRow | null>(null);
  const [className, setClassName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [hoursPerLesson, setHoursPerLesson] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<
    Extract<CalendarItem, { kind: "recurring" | "single-teacher" }> | null
  >(null);
  const [detailNote, setDetailNote] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rpcRows }, { data: sng }, { data: cans }, { data: tinfo }, { data: notesRows }] =
      await Promise.all([
        supabase.rpc("get_my_student_profile"),
        supabase
          .from("single_lessons")
          .select("*")
          .eq("student_id", studentId)
          .order("lesson_date", { ascending: false }),
        supabase
          .from("cancelled_lessons")
          .select("lesson_at")
          .eq("student_id", studentId),
        supabase.rpc("get_my_teacher_info"),
        supabase
          .from("student_lesson_notes")
          .select("lesson_ref, note")
          .eq("student_id", studentId),
      ]);
    const mine = Array.isArray(rpcRows)
      ? rpcRows.find((r: { id: string }) => r.id === studentId)
      : null;
    setCourse(mine ? (mine as unknown as CourseInfo) : null);
    setSingles((sng ?? []) as SingleRow[]);
    const set = new Set<string>();
    for (const c of cans ?? []) {
      set.add(new Date(c.lesson_at as string).toISOString());
    }
    setCancelled(set);
    const t = Array.isArray(tinfo) ? tinfo[0] : null;
    setTeacherEmail((t as { email?: string } | null)?.email ?? null);
    const nm: Record<string, string> = {};
    for (const n of notesRows ?? []) {
      nm[(n as { lesson_ref: string }).lesson_ref] = (n as { note: string }).note ?? "";
    }
    setNotesMap(nm);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const myUid = session?.user.id ?? "";
  const teacherDisplay = teacherDisplayName(teacherEmail);

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
        const ref = `recurring:${o.date.toISOString()}`;
        out.push({
          kind: "recurring",
          key: `r-${o.date.toISOString()}`,
          ref,
          date: o.date,
          end,
          title: `${teacherDisplay} 老师`,
        });
      }
    }
    for (const r of singles) {
      const [y, m, d] = r.lesson_date.split("-").map(Number);
      const [h, mm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      const start = new Date(y, m - 1, d, h, mm, 0);
      const end = new Date(y, m - 1, d, eh, em, 0);
      const isSelf = r.created_by === myUid;
      if (isSelf) {
        const title =
          r.class_name ?? (r.teacher_name ? `${r.teacher_name} 老师` : "单次课");
        out.push({
          kind: "single-self",
          key: `s-${r.id}`,
          date: start,
          end,
          title,
          row: r,
        });
      } else {
        const title =
          r.class_name ??
          (r.teacher_name ? `${r.teacher_name} 老师` : `${teacherDisplay} 老师`);
        out.push({
          kind: "single-teacher",
          key: `s-${r.id}`,
          ref: `single:${r.id}`,
          date: start,
          end,
          title,
          row: r,
        });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [course, singles, cancelled, myUid, teacherDisplay]);


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

  const inRange = items.filter(
    (o) => o.date >= rangeStart && o.date < rangeEnd,
  );

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

  const openAdd = () => {
    setEditing(null);
    setClassName("");
    setTeacherName("");
    setDate(today());
    setStartTime("14:00");
    setEndTime("16:00");
    setHoursPerLesson("");
    setHourlyRate("");
    setNotes("");
    setDialogOpen(true);
  };

  const openEdit = (r: SingleRow) => {
    setEditing(r);
    setClassName(r.class_name ?? "");
    setTeacherName(r.teacher_name ?? "");
    setDate(r.lesson_date);
    setStartTime(r.start_time.slice(0, 5));
    setEndTime(r.end_time.slice(0, 5));
    setHoursPerLesson(r.hours_per_lesson?.toString() ?? "");
    setHourlyRate(r.hourly_rate?.toString() ?? "");
    setNotes(r.notes ?? "");
    setDialogOpen(true);
  };

  const openDetail = (
    it: Extract<CalendarItem, { kind: "recurring" | "single-teacher" }>,
  ) => {
    setDetailItem(it);
    setDetailNote(notesMap[it.ref] ?? "");
    setDetailOpen(true);
  };

  const saveDetailNote = async () => {
    if (!detailItem) return;
    setDetailSaving(true);
    const payload = {
      student_id: studentId,
      lesson_ref: detailItem.ref,
      note: detailNote,
    };
    const { error } = await supabase
      .from("student_lesson_notes")
      .upsert(payload, { onConflict: "student_id,lesson_ref" });
    setDetailSaving(false);
    if (error) {
      toast.error("保存失败：" + error.message);
      return;
    }
    setNotesMap((m) => ({ ...m, [detailItem.ref]: detailNote }));
    toast.success("备注已保存");
    setDetailOpen(false);
  };

  const handleSave = async () => {
    if (!className.trim()) {
      toast.error("请填写课程名称");
      return;
    }
    if (!date || !startTime || !endTime) {
      toast.error("请填写日期和时间");
      return;
    }
    if (!myUid) {
      toast.error("未登录");
      return;
    }
    setSaving(true);
    const payload = {
      created_by: myUid,
      student_id: studentId,
      class_name: className.trim(),
      teacher_name: teacherName.trim() || null,
      lesson_date: date,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      hours_per_lesson: hoursPerLesson ? Number(hoursPerLesson) : null,
      hourly_rate: hourlyRate ? Number(hourlyRate) : null,
      notes: notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("single_lessons").update(payload).eq("id", editing.id)
      : await supabase.from("single_lessons").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("保存失败：" + error.message);
      return;
    }
    toast.success(editing ? "已更新" : "已添加");
    setDialogOpen(false);
    await load();
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm("确认删除此课次？")) return;
    setSaving(true);
    const { error } = await supabase
      .from("single_lessons")
      .delete()
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除");
    setDialogOpen(false);
    await load();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            我的课程表
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {label}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <CalendarPlus className="h-4 w-4" />
            新增课次
          </Button>
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
                    const timeStr = it.date.toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    });
                    if (it.kind === "single-self") {
                      return (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => openEdit(it.row)}
                          className="block w-full truncate rounded-md bg-sky-100 px-1.5 py-1 text-left text-[11px] text-sky-800 hover:bg-sky-200"
                          title={`${it.title} ${timeStr}`}
                        >
                          <span className="font-medium">{timeStr}</span>{" "}
                          {it.title}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => openDetail(it)}
                        className="block w-full truncate rounded-md bg-primary/10 px-1.5 py-1 text-left text-[11px] text-primary hover:bg-primary/20"
                        title={`${it.title} ${timeStr}`}
                      >
                        <span className="font-medium">{timeStr}</span>{" "}
                        {it.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && inRange.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-base font-semibold text-foreground">课程列表</h3>
          <div className="space-y-2">
            {inRange.map((it) => {
              const dateLabel = it.date.toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "short",
              });
              const timeStr = `${it.date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}${it.end ? "-" + it.end.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}`;
              if (it.kind === "single-self") {
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => openEdit(it.row)}
                    className="flex w-full items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left hover:bg-sky-100"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-sky-900">
                        {it.title}
                        <span className="ml-2 rounded bg-sky-200 px-1.5 py-0.5 text-[10px] text-sky-800">
                          自建
                        </span>
                      </div>
                      <div className="text-xs text-sky-700">
                        {dateLabel} · {timeStr}
                        {it.row.teacher_name ? ` · ${it.row.teacher_name} 老师` : ""}
                      </div>
                    </div>
                  </button>
                );
              }
              const badge = it.kind === "recurring" ? "固定" : "老师安排";
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => openDetail(it)}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {it.title}
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        {badge}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dateLabel} · {timeStr}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑课次" : "新增课次"}</DialogTitle>
            <DialogDescription>
              自行添加的课次仅出现在你的课程表中，可随时修改或删除。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>课程名称</Label>
              <Input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="如：AMC10 冲刺班"
              />
            </div>
            <div className="space-y-2">
              <Label>教师名字</Label>
              <Input
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="选填"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>上课日期</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>开始 / 结束</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>课时（小时）</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={hoursPerLesson}
                  onChange={(e) => setHoursPerLesson(e.target.value)}
                  placeholder="选填"
                />
              </div>
              <div className="space-y-2">
                <Label>单价（元/小时）</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="选填"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="选填"
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            {editing ? (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={saving}
                className="gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>课程详情</DialogTitle>
            <DialogDescription>
              老师安排的课次，你可以在这里查看信息并添加备注。
            </DialogDescription>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="mb-1 font-medium text-foreground">
                  {detailItem.title}
                </div>
                <div className="text-muted-foreground">
                  {detailItem.date.toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}
                </div>
                <div className="text-muted-foreground">
                  上课时间：
                  {detailItem.date.toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                  {detailItem.end
                    ? " - " +
                      detailItem.end.toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : ""}
                </div>
                <div className="text-muted-foreground">
                  上课老师：
                  {detailItem.kind === "single-teacher" && detailItem.row.teacher_name
                    ? `${detailItem.row.teacher_name} 老师`
                    : `${teacherDisplay} 老师`}
                </div>
              </div>
              <div className="space-y-2">
                <Label>我的备注</Label>
                <textarea
                  value={detailNote}
                  onChange={(e) => setDetailNote(e.target.value)}
                  placeholder="记录一下这节课的重点或问题…"
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailOpen(false)}
              disabled={detailSaving}
            >
              关闭
            </Button>
            <Button onClick={saveDetailNote} disabled={detailSaving}>
              {detailSaving ? "保存中..." : "保存备注"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
