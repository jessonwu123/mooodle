import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarPlus, ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  LessonEditorDialog,
  type SingleLessonRow,
} from "./lesson-editor-dialog";
import {
  BulkLessonActionsDialog,
  type PostponeUnit,
  type BulkAddPayload,
} from "./bulk-lesson-actions-dialog";
import {
  type CourseInfo,
  type ScheduleSlot,
  generateLessonOccurrences,
  lessonKey,
} from "@/lib/course-schedule";

interface Props {
  studentId: string;
}

type Item =
  | {
      kind: "single";
      key: string;
      date: Date;
      end: Date;
      row: SingleLessonRow;
    }
  | {
      kind: "recurring";
      key: string;
      date: Date;
      slot: ScheduleSlot;
    };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function SingleLessonsPanel({ studentId }: Props) {
  const { session } = useAuth();
  const [singles, setSingles] = useState<SingleLessonRow[]>([]);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SingleLessonRow | null>(null);
  const [recurringOverride, setRecurringOverride] = useState<{
    date: Date;
    slot: ScheduleSlot;
  } | null>(null);

  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<null | "postpone" | "reschedule" | "add">(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sng }, { data: stu }, { data: cans }] = await Promise.all([
      supabase
        .from("single_lessons")
        .select("*")
        .eq("student_id", studentId)
        .order("lesson_date", { ascending: false }),
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
    setSingles((sng ?? []) as SingleLessonRow[]);
    setCourse(stu ? (stu as unknown as CourseInfo) : null);
    const set = new Set<string>();
    for (const c of cans ?? []) {
      set.add(new Date(c.lesson_at as string).toISOString());
    }
    setCancelled(set);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const r of singles) {
      const [y, m, d] = r.lesson_date.split("-").map((n) => parseInt(n, 10));
      const [h, mm] = r.start_time.split(":").map((n) => parseInt(n, 10));
      const [eh, em] = r.end_time.split(":").map((n) => parseInt(n, 10));
      const date = new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, mm ?? 0);
      if (r.student_id && cancelled.has(lessonKey(date))) continue;
      out.push({
        kind: "single",
        key: `s-${r.id}`,
        date,
        end: new Date(y, (m ?? 1) - 1, d ?? 1, eh ?? 0, em ?? 0),
        row: r,
      });
    }
    if (course) {
      for (const o of generateLessonOccurrences(course)) {
        if (cancelled.has(lessonKey(o.date))) continue;
        out.push({
          kind: "recurring",
          key: `r-${o.date.toISOString()}`,
          date: o.date,
          slot: o.slot,
        });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [singles, course, cancelled]);

  const handleDeleteSingle = async (id: string) => {
    const { error } = await supabase.from("single_lessons").delete().eq("id", id);
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除");
    await load();
  };

  const handleCancelRecurring = async (date: Date) => {
    const { error } = await supabase.from("cancelled_lessons").insert({
      student_id: studentId,
      lesson_at: date.toISOString(),
      created_by: session?.user.id ?? null,
    });
    if (error) {
      toast.error("请假失败：" + error.message);
      return;
    }
    toast.success("已标记请假");
    await load();
  };

  const handleCancelSingle = async (row: SingleLessonRow) => {
    const dt = new Date(`${row.lesson_date}T${row.start_time.slice(0, 5)}`);
    const { error } = await supabase.from("cancelled_lessons").insert({
      student_id: studentId,
      lesson_at: dt.toISOString(),
      created_by: session?.user.id ?? null,
    });
    if (error) {
      toast.error("请假失败：" + error.message);
      return;
    }
    toast.success("已标记请假");
    await load();
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exitBatch = () => {
    setBatchMode(false);
    setSelected(new Set());
  };

  const selectedItems = useMemo(
    () => items.filter((it) => selected.has(it.key)),
    [items, selected],
  );

  const bulkDelete = async () => {
    if (selectedItems.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedItems.length} 个课次吗？`)) return;
    setBulkBusy(true);
    try {
      const singleIds = selectedItems
        .filter((it): it is Extract<Item, { kind: "single" }> => it.kind === "single")
        .map((it) => it.row.id);
      const recurringDates = selectedItems
        .filter((it): it is Extract<Item, { kind: "recurring" }> => it.kind === "recurring")
        .map((it) => it.date);

      if (singleIds.length > 0) {
        const { error } = await supabase
          .from("single_lessons")
          .delete()
          .in("id", singleIds);
        if (error) throw error;
      }
      if (recurringDates.length > 0) {
        const rows = recurringDates.map((d) => ({
          student_id: studentId,
          lesson_at: d.toISOString(),
          created_by: session?.user.id ?? null,
        }));
        const { error } = await supabase.from("cancelled_lessons").insert(rows);
        if (error) throw error;
      }
      toast.success(`已删除 ${selectedItems.length} 个课次`);
      exitBatch();
      await load();
    } catch (e) {
      toast.error("批量删除失败：" + (e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const applyBulkChange = async (
    computeNew: (it: Item) => { date: Date; start: string; end: string },
  ) => {
    if (!session?.user.id) {
      toast.error("请先登录");
      return;
    }
    setBulkBusy(true);
    try {
      const cancelRows: { student_id: string; lesson_at: string; created_by: string | null }[] = [];
      const insertRows: {
        created_by: string;
        student_id: string;
        class_name: null;
        lesson_date: string;
        start_time: string;
        end_time: string;
        hours_per_lesson: number | null;
        hourly_rate: number | null;
        notes: null;
      }[] = [];

      for (const it of selectedItems) {
        const nv = computeNew(it);
        if (it.kind === "single") {
          const { error } = await supabase
            .from("single_lessons")
            .update({
              lesson_date: fmtDate(nv.date),
              start_time: `${nv.start}:00`,
              end_time: `${nv.end}:00`,
            })
            .eq("id", it.row.id);
          if (error) throw error;
        } else {
          cancelRows.push({
            student_id: studentId,
            lesson_at: it.date.toISOString(),
            created_by: session.user.id,
          });
          insertRows.push({
            created_by: session.user.id,
            student_id: studentId,
            class_name: null,
            lesson_date: fmtDate(nv.date),
            start_time: `${nv.start}:00`,
            end_time: `${nv.end}:00`,
            hours_per_lesson: course?.hours_per_lesson ?? null,
            hourly_rate: course?.hourly_rate ?? null,
            notes: null,
          });
        }
      }
      if (cancelRows.length > 0) {
        const { error } = await supabase.from("cancelled_lessons").insert(cancelRows);
        if (error) throw error;
      }
      if (insertRows.length > 0) {
        const { error } = await supabase.from("single_lessons").insert(insertRows);
        if (error) throw error;
      }
      toast.success(`已更新 ${selectedItems.length} 个课次`);
      setBulkDialog(null);
      exitBatch();
      await load();
    } catch (e) {
      toast.error("批量操作失败：" + (e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const onConfirmPostpone = async (amount: number, unit: PostponeUnit) => {
    await applyBulkChange((it) => {
      let newDate: Date;
      if (unit === "day") {
        newDate = addDays(it.date, amount);
      } else if (unit === "week") {
        newDate = addDays(it.date, amount * 7);
      } else {
        newDate = new Date(it.date);
        newDate.setMonth(newDate.getMonth() + amount);
      }
      const startStr = `${pad(it.date.getHours())}:${pad(it.date.getMinutes())}`;
      let endStr: string;
      if (it.kind === "single") {
        endStr = `${pad(it.end.getHours())}:${pad(it.end.getMinutes())}`;
      } else {
        endStr = it.slot.end_time ? it.slot.end_time.slice(0, 5) : startStr;
      }
      return { date: newDate, start: startStr, end: endStr };
    });
  };

  const onConfirmBulkAdd = async (p: BulkAddPayload) => {
    if (!session?.user.id) {
      toast.error("请先登录");
      return;
    }
    if (p.weekdays.length === 0) {
      toast.error("请选择至少一个星期");
      return;
    }
    setBulkBusy(true);
    try {
      const [sy, sm, sd] = p.startDate.split("-").map((n) => parseInt(n, 10));
      const [ey, em, ed] = p.endDate.split("-").map((n) => parseInt(n, 10));
      const start = new Date(sy, (sm ?? 1) - 1, sd ?? 1);
      const end = new Date(ey, (em ?? 1) - 1, ed ?? 1);
      const rows: {
        created_by: string;
        student_id: string;
        class_name: string | null;
        lesson_date: string;
        start_time: string;
        end_time: string;
        hours_per_lesson: number | null;
        hourly_rate: number | null;
        notes: null;
      }[] = [];
      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        if (p.weekdays.includes(d.getDay())) {
          rows.push({
            created_by: session.user.id,
            student_id: studentId,
            class_name: p.className || null,
            lesson_date: fmtDate(d),
            start_time: `${p.startTime}:00`,
            end_time: `${p.endTime}:00`,
            hours_per_lesson: p.hoursPerLesson,
            hourly_rate: p.hourlyRate,
            notes: null,
          });
        }
      }
      if (rows.length === 0) {
        toast.error("指定范围内没有符合星期的日期");
        return;
      }
      const { error } = await supabase.from("single_lessons").insert(rows);
      if (error) throw error;
      toast.success(`已新增 ${rows.length} 个课次`);
      setBulkDialog(null);
      await load();
    } catch (e) {
      toast.error("批量新增失败：" + (e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const onConfirmReschedule = async (weekday: number, start: string, end: string) => {
    await applyBulkChange((it) => {
      const delta = weekday - it.date.getDay();
      const newDate = addDays(it.date, delta);
      return { date: newDate, start, end };
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">课次管理</h3>
        </div>
        {session?.user.id && (
          <div className="flex flex-wrap items-center gap-2">
            {!batchMode ? (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setRecurringOverride(null);
                    setOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <CalendarPlus className="h-4 w-4" />
                  新增课次
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkDialog("add")}
                  className="gap-1.5"
                >
                  <CalendarPlus className="h-4 w-4" />
                  批量增加
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBatchMode(true)}
                  className="gap-1.5"
                >
                  <ListChecks className="h-4 w-4" />
                  批量操作
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  已选 {selected.size} 项
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelected(
                      selected.size === items.length
                        ? new Set()
                        : new Set(items.map((i) => i.key)),
                    )
                  }
                >
                  {selected.size === items.length ? "取消全选" : "全选"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={bulkDelete}
                >
                  批量删除
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={() => setBulkDialog("postpone")}
                >
                  批量顺延
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={() => setBulkDialog("reschedule")}
                >
                  批量改时间
                </Button>
                <Button size="sm" variant="ghost" onClick={exitBatch}>
                  退出
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">加载中...</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          暂无课次。可在此新增单次课程，或在课程信息中设置固定上课时间。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const label = (
              <>
                <div className="text-sm font-medium text-foreground">
                  {it.date.toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}{" "}
                  ·{" "}
                  {it.kind === "single"
                    ? `${it.row.start_time.slice(0, 5)}-${it.row.end_time.slice(0, 5)}`
                    : `${it.slot.start_time.slice(0, 5)}${it.slot.end_time ? "-" + it.slot.end_time.slice(0, 5) : ""}`}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {it.kind === "single" ? (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700">
                      单次
                    </span>
                  ) : (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      固定
                    </span>
                  )}
                  {it.kind === "single" && it.row.notes && (
                    <span className="truncate">{it.row.notes}</span>
                  )}
                </div>
              </>
            );

            if (batchMode) {
              return (
                <label
                  key={it.key}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={selected.has(it.key)}
                    onCheckedChange={() => toggleSelect(it.key)}
                  />
                  <div className="min-w-0 flex-1">{label}</div>
                </label>
              );
            }
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => {
                  if (it.kind === "single") {
                    setEditing(it.row);
                    setRecurringOverride(null);
                  } else {
                    setEditing(null);
                    setRecurringOverride({ date: it.date, slot: it.slot });
                  }
                  setOpen(true);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-left hover:bg-muted/40"
              >
                <div className="min-w-0">{label}</div>
              </button>
            );
          })}
        </div>
      )}

      {session?.user.id && open && (
        <LessonEditorDialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setRecurringOverride(null);
            }
          }}
          createdBy={session.user.id}
          lockedStudentId={studentId}
          editing={editing}
          initialValues={
            recurringOverride
              ? {
                  student_id: studentId,
                  class_name: null,
                  lesson_date: `${recurringOverride.date.getFullYear()}-${String(recurringOverride.date.getMonth() + 1).padStart(2, "0")}-${String(recurringOverride.date.getDate()).padStart(2, "0")}`,
                  start_time: recurringOverride.slot.start_time,
                  end_time: recurringOverride.slot.end_time ?? "16:00:00",
                  hours_per_lesson: course?.hours_per_lesson ?? null,
                  hourly_rate: course?.hourly_rate ?? null,
                  notes: null,
                }
              : undefined
          }
          title={
            recurringOverride
              ? "课次详情（可编辑，将覆盖本次固定课程）"
              : editing
                ? "编辑课次"
                : "新增课次"
          }
          beforeSave={
            recurringOverride
              ? async () => {
                  const { error } = await supabase
                    .from("cancelled_lessons")
                    .insert({
                      student_id: studentId,
                      lesson_at: recurringOverride.date.toISOString(),
                      created_by: session.user.id,
                    });
                  if (error) {
                    toast.error("保存失败：" + error.message);
                    return false;
                  }
                  return true;
                }
              : undefined
          }
          onDelete={
            editing
              ? async () => {
                  await handleDeleteSingle(editing.id);
                  setOpen(false);
                }
              : recurringOverride
                ? async () => {
                    await handleCancelRecurring(recurringOverride.date);
                    setOpen(false);
                  }
                : undefined
          }
          onSaved={load}
        />
      )}

      <BulkLessonActionsDialog
        open={bulkDialog !== null}
        onOpenChange={(v) => !v && setBulkDialog(null)}
        mode={bulkDialog}
        count={selected.size}
        onConfirmPostpone={onConfirmPostpone}
        onConfirmReschedule={onConfirmReschedule}
        onConfirmAdd={onConfirmBulkAdd}
      />
    </section>
  );
}
