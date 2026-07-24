import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { WEEKDAY_LABELS } from "@/lib/course-schedule";

export type PostponeUnit = "day" | "week" | "month";

export interface BulkAddPayload {
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  className: string;
  hoursPerLesson: number | null;
  hourlyRate: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "postpone" | "reschedule" | "add" | null;
  count: number;
  onConfirmPostpone: (amount: number, unit: PostponeUnit) => Promise<void> | void;
  onConfirmReschedule: (
    weekday: number,
    startTime: string,
    endTime: string,
  ) => Promise<void> | void;
  onConfirmAdd?: (payload: BulkAddPayload) => Promise<void> | void;
}

export function BulkLessonActionsDialog({
  open,
  onOpenChange,
  mode,
  count,
  onConfirmPostpone,
  onConfirmReschedule,
  onConfirmAdd,
}: Props) {
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<PostponeUnit>("week");
  const [weekday, setWeekday] = useState("6");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const [busy, setBusy] = useState(false);

  // add mode
  const today = new Date().toISOString().slice(0, 10);
  const [addStartDate, setAddStartDate] = useState(today);
  const [addEndDate, setAddEndDate] = useState(today);
  const [addWeekdays, setAddWeekdays] = useState<number[]>([6]);
  const [addStart, setAddStart] = useState("14:00");
  const [addEnd, setAddEnd] = useState("16:00");
  const [addClassName, setAddClassName] = useState("");
  const [addHours, setAddHours] = useState("");
  const [addRate, setAddRate] = useState("");

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "postpone") {
        await onConfirmPostpone(Number(amount) || 0, unit);
      } else if (mode === "reschedule") {
        await onConfirmReschedule(Number(weekday), start, end);
      } else if (mode === "add" && onConfirmAdd) {
        await onConfirmAdd({
          startDate: addStartDate,
          endDate: addEndDate,
          weekdays: addWeekdays,
          startTime: addStart,
          endTime: addEnd,
          className: addClassName,
          hoursPerLesson: addHours === "" ? null : Number(addHours),
          hourlyRate: addRate === "" ? null : Number(addRate),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleAddWeekday = (i: number, checked: boolean) => {
    setAddWeekdays((prev) =>
      checked ? [...new Set([...prev, i])] : prev.filter((x) => x !== i),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "postpone"
              ? "批量顺延"
              : mode === "reschedule"
                ? "批量修改上课时间"
                : "批量增加课程"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "在指定日期范围内，按选定星期与时间批量生成单次课程。"
              : `将对已选中的 ${count} 个课次执行操作。固定课程会以覆盖方式生成新的单次课程。`}
          </DialogDescription>
        </DialogHeader>

        {mode === "postpone" && (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div className="space-y-2">
                <Label>顺延数量（可为负数表示提前）</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>单位</Label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as PostponeUnit)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="day">天</option>
                  <option value="week">周</option>
                  <option value="month">月</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {mode === "reschedule" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>星期</Label>
              <select
                value={weekday}
                onChange={(e) => setWeekday(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {WEEKDAY_LABELS.map((w, i) => (
                  <option key={i} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>开始</Label>
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>结束</Label>
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {mode === "add" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>开始日期</Label>
                <Input
                  type="date"
                  value={addStartDate}
                  onChange={(e) => setAddStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>结束日期</Label>
                <Input
                  type="date"
                  value={addEndDate}
                  onChange={(e) => setAddEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>选择星期（可多选）</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((w, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
                  >
                    <Checkbox
                      checked={addWeekdays.includes(i)}
                      onCheckedChange={(v) => toggleAddWeekday(i, Boolean(v))}
                    />
                    {w}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>开始时间</Label>
                <Input type="time" value={addStart} onChange={(e) => setAddStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>结束时间</Label>
                <Input type="time" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>课程名称（可选）</Label>
              <Input
                value={addClassName}
                onChange={(e) => setAddClassName(e.target.value)}
                placeholder="例如 AMC8 冲刺"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>每节课时长（可选）</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={addHours}
                  onChange={(e) => setAddHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>课时费（可选）</Label>
                <Input
                  type="number"
                  step="1"
                  value={addRate}
                  onChange={(e) => setAddRate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "处理中..." : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
