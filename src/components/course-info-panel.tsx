import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  type CourseInfo,
  totalLessonCount,
  WEEKDAY_LABELS,
  generateLessonDates,
} from "@/lib/course-schedule";
import { BookOpen, CalendarClock } from "lucide-react";

interface Props {
  studentId: string;
}

export function CourseInfoPanel({ studentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState<CourseInfo>({
    total_hours: null,
    hours_per_lesson: null,
    schedule_start_date: null,
    schedule_weekday: null,
    schedule_start_time: null,
    schedule_end_time: null,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("students")
        .select(
          "total_hours, hours_per_lesson, schedule_start_date, schedule_weekday, schedule_start_time, schedule_end_time",
        )
        .eq("id", studentId)
        .maybeSingle();
      if (data) {
        setC({
          total_hours: data.total_hours as number | null,
          hours_per_lesson: data.hours_per_lesson as number | null,
          schedule_start_date: data.schedule_start_date as string | null,
          schedule_weekday: data.schedule_weekday as number | null,
          schedule_start_time: data.schedule_start_time as string | null,
          schedule_end_time: data.schedule_end_time as string | null,
        });
      }
      setLoading(false);
    })();
  }, [studentId]);

  const lessonCount = totalLessonCount(c);
  const upcoming = generateLessonDates(c).slice(0, 5);

  const handleSave = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("students")
      .update({
        total_hours: c.total_hours,
        hours_per_lesson: c.hours_per_lesson,
        schedule_start_date: c.schedule_start_date,
        schedule_weekday: c.schedule_weekday,
        schedule_start_time: c.schedule_start_time,
        schedule_end_time: c.schedule_end_time,
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
            <Label>星期几</Label>
            <Select
              value={c.schedule_weekday == null ? "" : String(c.schedule_weekday)}
              onValueChange={(v) =>
                setC((p) => ({ ...p, schedule_weekday: Number(v) }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((w, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_time">开始时间</Label>
            <Input
              id="start_time"
              type="time"
              value={c.schedule_start_time?.slice(0, 5) ?? ""}
              onChange={(e) =>
                setC((p) => ({
                  ...p,
                  schedule_start_time: e.target.value ? `${e.target.value}:00` : null,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_time">结束时间</Label>
            <Input
              id="end_time"
              type="time"
              value={c.schedule_end_time?.slice(0, 5) ?? ""}
              onChange={(e) =>
                setC((p) => ({
                  ...p,
                  schedule_end_time: e.target.value ? `${e.target.value}:00` : null,
                }))
              }
            />
          </div>
        </div>

        {upcoming.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              最近 {upcoming.length} 节课预览
            </div>
            <div className="space-y-1.5">
              {upcoming.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="text-foreground">
                    {d.toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {c.schedule_start_time?.slice(0, 5)}
                    {c.schedule_end_time ? `-${c.schedule_end_time.slice(0, 5)}` : ""}
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
