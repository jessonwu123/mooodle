import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface SingleLessonRow {
  id: string;
  created_by: string;
  student_id: string | null;
  class_name: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  hours_per_lesson: number | null;
  hourly_rate: number | null;
  notes: string | null;
}

export interface StudentOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  createdBy: string;
  /** If set, lesson is locked to this student (in student profile). */
  lockedStudentId?: string;
  /** For "add from schedule" case - shown as options. */
  studentOptions?: StudentOption[];
  /** Existing lesson to edit; if null, create new. */
  editing?: SingleLessonRow | null;
  /** Prefill values when creating a new lesson (e.g. from a recurring/imported occurrence override). */
  initialValues?: Partial<
    Pick<
      SingleLessonRow,
      "student_id" | "class_name" | "lesson_date" | "start_time" | "end_time" | "hours_per_lesson" | "hourly_rate" | "notes"
    >
  >;
  /** Optional hook that runs after validation, before insert/update. Return false to abort. */
  beforeSave?: () => Promise<boolean> | boolean;
  /** Override the dialog title. */
  title?: string;
  /** If provided, show a Delete button that calls this. */
  onDelete?: () => Promise<void> | void;
  onSaved: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function LessonEditorDialog({
  open,
  onOpenChange,
  createdBy,
  lockedStudentId,
  studentOptions,
  editing,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<"student" | "custom">("student");
  const [studentId, setStudentId] = useState<string>("");
  const [className, setClassName] = useState("");
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [hoursPerLesson, setHoursPerLesson] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setMode(editing.student_id ? "student" : "custom");
      setStudentId(editing.student_id ?? "");
      setClassName(editing.class_name ?? "");
      setDate(editing.lesson_date);
      setStartTime(editing.start_time.slice(0, 5));
      setEndTime(editing.end_time.slice(0, 5));
      setHoursPerLesson(editing.hours_per_lesson?.toString() ?? "");
      setHourlyRate(editing.hourly_rate?.toString() ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setMode(lockedStudentId ? "student" : "student");
      setStudentId(lockedStudentId ?? studentOptions?.[0]?.id ?? "");
      setClassName("");
      setDate(today());
      setStartTime("14:00");
      setEndTime("16:00");
      setHoursPerLesson("");
      setHourlyRate("");
      setNotes("");
    }
  }, [open, editing, lockedStudentId, studentOptions]);

  const handleSave = async () => {
    if (!date || !startTime || !endTime) {
      toast.error("请填写日期和时间");
      return;
    }
    if (mode === "student" && !studentId) {
      toast.error("请选择学生");
      return;
    }
    if (mode === "custom" && !className.trim()) {
      toast.error("请填写课程名称");
      return;
    }
    setBusy(true);
    const payload = {
      created_by: createdBy,
      student_id: mode === "student" ? studentId : null,
      class_name: mode === "custom" ? className.trim() : null,
      lesson_date: date,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      hours_per_lesson: hoursPerLesson ? Number(hoursPerLesson) : null,
      hourly_rate: hourlyRate ? Number(hourlyRate) : null,
      notes: notes.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase
        .from("single_lessons")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("single_lessons").insert(payload));
    }
    setBusy(false);
    if (error) {
      toast.error("保存失败：" + error.message);
      return;
    }
    toast.success(editing ? "已更新课次" : "已添加课次");
    onOpenChange(false);
    onSaved();
  };

  const canPickMode = !lockedStudentId && !editing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑课次" : "新增课次"}</DialogTitle>
          <DialogDescription>
            {lockedStudentId
              ? "为该学生添加一次独立课程。"
              : "选择现有学生，或输入自定义课程名称（不会新建学生档案）。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canPickMode && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "student" ? "default" : "outline"}
                onClick={() => setMode("student")}
              >
                选择现有学生
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "custom" ? "default" : "outline"}
                onClick={() => setMode("custom")}
              >
                自定义名称
              </Button>
            </div>
          )}

          {mode === "student" && !lockedStudentId && (
            <div className="space-y-2">
              <Label>学生</Label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择学生</option>
                {(studentOptions ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "custom" && (
            <div className="space-y-2">
              <Label>课程/班级名称</Label>
              <Input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="如：AMC10 冲刺班"
              />
            </div>
          )}

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
              <Label>课时费（元/小时）</Label>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
