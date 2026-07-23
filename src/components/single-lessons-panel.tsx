import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import {
  LessonEditorDialog,
  type SingleLessonRow,
} from "./lesson-editor-dialog";
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
      out.push({
        kind: "single",
        key: `s-${r.id}`,
        date: new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, mm ?? 0),
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
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除该节课");
    await load();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">课次管理</h3>
        </div>
        {session?.user.id && (
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
          {items.map((it) => (
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
              <div className="min-w-0">
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
              </div>
            </button>
          ))}
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
    </section>
  );
}
