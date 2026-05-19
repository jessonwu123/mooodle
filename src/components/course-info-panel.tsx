import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  type CourseInfo,
  type ScheduleSlot,
  totalLessonCount,
  totalCourseFee,
  WEEKDAY_LABELS,
  generateLessonOccurrences,
  effectiveSlots,
} from "@/lib/course-schedule";
import { BookOpen, CalendarClock, Coins } from "lucide-react";

interface Props {
  studentId: string;
}

export function CourseInfoPanel({ studentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState<CourseInfo>({
    total_hours: null,
    hours_per_lesson: null,
    hourly_rate: null,
    schedule_start_date: null,
    schedule_slots: [],
    schedule_frequency_weeks: 1,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("students")
        .select(
          "total_hours, hours_per_lesson, hourly_rate, schedule_start_date, schedule_slots, schedule_frequency_weeks, schedule_weekday, schedule_start_time, schedule_end_time",
        )
        .eq("id", studentId)
        .maybeSingle();
      if (data) {
        const initial: CourseInfo = {
          total_hours: data.total_hours as number | null,
          hours_per_lesson: data.hours_per_lesson as number | null,
          hourly_rate: data.hourly_rate as number | null,
          schedule_start_date: data.schedule_start_date as string | null,
          schedule_slots: (data.schedule_slots as ScheduleSlot[] | null) ?? null,
          schedule_frequency_weeks:
            (data.schedule_frequency_weeks as number | null) ?? 1,
          schedule_weekday: data.schedule_weekday as number | null,
          schedule_start_time: data.schedule_start_time as string | null,
          schedule_end_time: data.schedule_end_time as string | null,
        };
        // If no multi-slots saved but legacy single slot exists, seed it
        if (
          (!initial.schedule_slots || initial.schedule_slots.length === 0) &&
          initial.schedule_weekday != null &&
          initial.schedule_start_time
        ) {
          initial.schedule_slots = [
            {
              weekday: initial.schedule_weekday,
              start_time: initial.schedule_start_time,
              end_time: initial.schedule_end_time ?? null,
            },
          ];
        }
        setC(initial);
      }
      setLoading(false);
    })();
  }, [studentId]);

  const lessonCount = totalLessonCount(c);
  const upcoming = generateLessonOccurrences(c).slice(0, 5);
  const slots = c.schedule_slots ?? [];

  const toggleWeekday = (wd: number, checked: boolean) => {
    setC((p) => {
      const cur = p.schedule_slots ?? [];
      if (checked) {
        if (cur.some((s) => s.weekday === wd)) return p;
        return {
          ...p,
          schedule_slots: [
            ...cur,
            { weekday: wd, start_time: "14:00:00", end_time: "16:00:00" },
          ],
        };
      }
      return {
        ...p,
        schedule_slots: cur.filter((s) => s.weekday !== wd),
      };
    });
  };

  const updateSlot = (wd: number, patch: Partial<ScheduleSlot>) => {
    setC((p) => ({
      ...p,
      schedule_slots: (p.schedule_slots ?? []).map((s) =>
        s.weekday === wd ? { ...s, ...patch } : s,
      ),
    }));
  };

  const handleSave = async () => {
    setBusy(true);
    // Keep legacy single fields in sync with first slot for backward compatibility
    const first = effectiveSlots(c)[0];
    const { error } = await supabase
      .from("students")
      .update({
        total_hours: c.total_hours,
        hours_per_lesson: c.hours_per_lesson,
        hourly_rate: c.hourly_rate,
        schedule_start_date: c.schedule_start_date,
        schedule_slots: (c.schedule_slots ?? []) as unknown as never,
        schedule_frequency_weeks: c.schedule_frequency_weeks ?? 1,
        schedule_weekday: first?.weekday ?? null,
        schedule_start_time: first?.start_time ?? null,
        schedule_end_time: first?.end_time ?? null,
      })
      .eq("id", studentId);
    setBusy(false);
    if (error) {
      toast.error("保存失败：" + error.message);
      return;
    }
    toast.success("已保存课程信息");
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">课时设置</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="total_hours">总课时（小时）</Label>
            <Input
              id="total_hours"
              type="number"
              min={0}
              step={0.5}
              value={c.total_hours ?? ""}
              onChange={(e) =>
                setC((p) => ({
                  ...p,
                  total_hours: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="例如 40"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours_per_lesson">每节课时长（小时）</Label>
            <Input
              id="hours_per_lesson"
              type="number"
              min={0}
              step={0.5}
              value={c.hours_per_lesson ?? ""}
              onChange={(e) =>
                setC((p) => ({
                  ...p,
                  hours_per_lesson:
                    e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="例如 2"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
          <span className="text-sm font-medium text-foreground">总课节数</span>
          <span className="text-lg font-bold text-primary">{lessonCount} 节</span>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">固定上课时间</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="schedule_start_date">开始日期（第一周）</Label>
            <Input
              id="schedule_start_date"
              type="date"
              value={c.schedule_start_date ?? ""}
              onChange={(e) =>
                setC((p) => ({
                  ...p,
                  schedule_start_date: e.target.value || null,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="freq">上课频率（每 N 周一次）</Label>
            <Input
              id="freq"
              type="number"
              min={1}
              step={1}
              value={c.schedule_frequency_weeks ?? 1}
              onChange={(e) =>
                setC((p) => ({
                  ...p,
                  schedule_frequency_weeks:
                    e.target.value === "" ? 1 : Math.max(1, Number(e.target.value)),
                }))
              }
            />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Label>选择上课的星期（可多选）</Label>
          <div className="flex flex-wrap gap-3">
            {WEEKDAY_LABELS.map((w, i) => {
              const checked = slots.some((s) => s.weekday === i);
              return (
                <label
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleWeekday(i, Boolean(v))}
                  />
                  <span>{w}</span>
                </label>
              );
            })}
          </div>
        </div>

        {slots.length > 0 && (
          <div className="mt-5 space-y-3">
            <Label>各天上课时间</Label>
            <div className="space-y-2">
              {[...slots]
                .sort((a, b) => a.weekday - b.weekday)
                .map((s) => (
                  <div
                    key={s.weekday}
                    className="grid grid-cols-[80px_1fr_1fr] items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-foreground">
                      {WEEKDAY_LABELS[s.weekday]}
                    </div>
                    <Input
                      type="time"
                      value={s.start_time?.slice(0, 5) ?? ""}
                      onChange={(e) =>
                        updateSlot(s.weekday, {
                          start_time: e.target.value
                            ? `${e.target.value}:00`
                            : "",
                        })
                      }
                    />
                    <Input
                      type="time"
                      value={s.end_time?.slice(0, 5) ?? ""}
                      onChange={(e) =>
                        updateSlot(s.weekday, {
                          end_time: e.target.value ? `${e.target.value}:00` : null,
                        })
                      }
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              最近 {upcoming.length} 节课预览
            </div>
            <div className="space-y-1.5">
              {upcoming.map((o, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="text-foreground">
                    {o.date.toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {o.slot.start_time?.slice(0, 5)}
                    {o.slot.end_time ? `-${o.slot.end_time.slice(0, 5)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={busy}>
          {busy ? "保存中..." : "保存课程信息"}
        </Button>
      </div>
    </div>
  );
}
