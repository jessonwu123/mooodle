import { useEffect, useMemo, useState } from "react";
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
  
  lessonKey,
} from "@/lib/course-schedule";
import { BookOpen, CalendarClock, Coins, CheckCircle2, Clock } from "lucide-react";

interface Props {
  studentId: string;
}

interface SingleLessonLite {
  id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  hours_per_lesson: number | null;
  hourly_rate: number | null;
}

function diffHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

export function CourseInfoPanel({ studentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [singles, setSingles] = useState<SingleLessonLite[]>([]);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
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
      const [{ data }, { data: sng }, { data: cans }] = await Promise.all([
        supabase
          .from("students")
          .select(
            "total_hours, hours_per_lesson, hourly_rate, schedule_start_date, schedule_slots, schedule_frequency_weeks, schedule_weekday, schedule_start_time, schedule_end_time",
          )
          .eq("id", studentId)
          .maybeSingle(),
        supabase
          .from("single_lessons")
          .select("id, lesson_date, start_time, end_time, hours_per_lesson, hourly_rate")
          .eq("student_id", studentId),
        supabase.from("cancelled_lessons").select("lesson_at, kind").eq("student_id", studentId),
      ]);
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
      setSingles((sng ?? []) as SingleLessonLite[]);
      const set = new Set<string>();
      for (const cn of cans ?? []) {
        set.add(new Date(cn.lesson_at as string).toISOString());
      }
      setCancelled(set);
      setLoading(false);
    })();
  }, [studentId]);

  const lessonCount = totalLessonCount(c);
  const upcoming = generateLessonOccurrences(c).slice(0, 5);
  const slots = c.schedule_slots ?? [];

  // === Overview computations across all lessons (single + recurring) ===
  const overview = useMemo(() => {
    const now = new Date();
    let pastHours = 0;
    let futureHours = 0;
    let totalFee = 0;

    // Single lessons
    for (const s of singles) {
      const [y, m, d] = s.lesson_date.split("-").map(Number);
      const [h, mm] = s.start_time.split(":").map(Number);
      const dt = new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, mm ?? 0);
      if (cancelled.has(dt.toISOString())) continue;
      const hours =
        s.hours_per_lesson != null && s.hours_per_lesson > 0
          ? Number(s.hours_per_lesson)
          : diffHours(s.start_time, s.end_time);
      const rate = s.hourly_rate ?? c.hourly_rate ?? 0;
      if (dt < now) pastHours += hours;
      else futureHours += hours;
      totalFee += hours * (rate ?? 0);
    }

    // Recurring lessons
    const occs = generateLessonOccurrences(c);
    const perLesson = c.hours_per_lesson ?? 0;
    const rate = c.hourly_rate ?? 0;
    for (const o of occs) {
      if (cancelled.has(lessonKey(o.date))) continue;
      const hours =
        perLesson > 0
          ? perLesson
          : o.slot.end_time
            ? diffHours(o.slot.start_time, o.slot.end_time)
            : 0;
      if (o.date < now) pastHours += hours;
      else futureHours += hours;
      totalFee += hours * rate;
    }

    const total = pastHours + futureHours;
    return {
      total: Math.round(total * 100) / 100,
      past: Math.round(pastHours * 100) / 100,
      future: Math.round(futureHours * 100) / 100,
      fee: Math.round(totalFee * 100) / 100,
    };
  }, [singles, cancelled, c]);

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
    // 「新增课程」为累加操作：按当前表单参数生成一批 single_lessons，
    // 不会覆盖学生表里已存在的固定课程配置。
    const occs = generateLessonOccurrences(c);
    if (occs.length === 0) {
      toast.error("请填写总课时、每节时长、开始日期与至少一个上课时段");
      return;
    }
    setBusy(true);

    // 学生级课时费默认值：仅当学生表里还没设置时才写入，避免覆盖旧值
    const { data: cur } = await supabase
      .from("students")
      .select("hourly_rate")
      .eq("id", studentId)
      .maybeSingle();
    if (cur && cur.hourly_rate == null && c.hourly_rate != null) {
      await supabase
        .from("students")
        .update({ hourly_rate: c.hourly_rate })
        .eq("id", studentId);
    }

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    const rows = occs.map((o) => {
      const d = o.date;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const endTime =
        o.slot.end_time && o.slot.end_time.length >= 5
          ? o.slot.end_time.slice(0, 8).padEnd(8, ":00".slice(0, 8 - o.slot.end_time.slice(0, 8).length))
          : "00:00:00";
      return {
        student_id: studentId,
        created_by: uid,
        lesson_date: `${yyyy}-${mm}-${dd}`,
        start_time: o.slot.start_time.length === 5 ? `${o.slot.start_time}:00` : o.slot.start_time,
        end_time: o.slot.end_time
          ? (o.slot.end_time.length === 5 ? `${o.slot.end_time}:00` : o.slot.end_time)
          : endTime,
        hours_per_lesson: c.hours_per_lesson,
        hourly_rate: c.hourly_rate,
      };
    });

    const { error } = await supabase.from("single_lessons").insert(rows as never);
    setBusy(false);
    if (error) {
      toast.error("生成失败：" + error.message);
      return;
    }
    toast.success(`已新增 ${rows.length} 节课`);
    // 载入新数据，清空表单里本次输入的课时字段（保留时段以便再次填写）
    const { data: sng } = await supabase
      .from("single_lessons")
      .select("id, lesson_date, start_time, end_time, hours_per_lesson, hourly_rate")
      .eq("student_id", studentId);
    setSingles((sng ?? []) as SingleLessonLite[]);
    setC((p) => ({ ...p, total_hours: null }));
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 课程信息总览 */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">课程信息总览</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              总课时数
            </span>
            <span className="text-lg font-bold text-primary">{overview.total} 小时</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-emerald-600" />
              总课时费
            </span>
            <span className="text-lg font-bold text-emerald-600">¥{overview.fee}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-sky-50 px-4 py-3 dark:bg-sky-900/20">
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-600" />
              已上课时数
            </span>
            <span className="text-lg font-bold text-sky-600">{overview.past} 小时</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              未上课时数
            </span>
            <span className="text-lg font-bold text-amber-600">{overview.future} 小时</span>
          </div>
        </div>
      </section>

      {/* 新增课程（含课时设置） */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">新增课程</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
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
          <div className="space-y-2">
            <Label htmlFor="hourly_rate">课时费（元/小时）</Label>
            <Input
              id="hourly_rate"
              type="number"
              min={0}
              step={1}
              value={c.hourly_rate ?? ""}
              onChange={(e) =>
                setC((p) => ({
                  ...p,
                  hourly_rate: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="例如 200"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
            <span className="text-sm font-medium text-foreground">本次课节数</span>
            <span className="text-lg font-bold text-primary">{lessonCount} 节</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-emerald-600" />
              本次课程费
            </span>
            <span className="text-lg font-bold text-emerald-600">¥{totalCourseFee(c)}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
          {busy ? "生成中..." : "生成课次"}
        </Button>
      </div>
    </div>
  );
}
