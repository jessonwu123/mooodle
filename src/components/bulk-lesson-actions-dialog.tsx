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
import { WEEKDAY_LABELS } from "@/lib/course-schedule";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "postpone" | "reschedule" | null;
  count: number;
  onConfirmPostpone: (days: number) => Promise<void> | void;
  onConfirmReschedule: (
    weekday: number,
    startTime: string,
    endTime: string,
  ) => Promise<void> | void;
}

export function BulkLessonActionsDialog({
  open,
  onOpenChange,
  mode,
  count,
  onConfirmPostpone,
  onConfirmReschedule,
}: Props) {
  const [days, setDays] = useState("7");
  const [weekday, setWeekday] = useState("6");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "postpone") {
        await onConfirmPostpone(Number(days) || 0);
      } else if (mode === "reschedule") {
        await onConfirmReschedule(Number(weekday), start, end);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "postpone" ? "批量顺延" : "批量修改上课时间"}
          </DialogTitle>
          <DialogDescription>
            将对已选中的 {count} 个课次执行操作。固定课程会以覆盖方式生成新的单次课程。
          </DialogDescription>
        </DialogHeader>

        {mode === "postpone" && (
          <div className="space-y-2">
            <Label>顺延天数（可为负数表示提前）</Label>
            <Input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
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
