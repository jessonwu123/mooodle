import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  DialogTrigger,
} from "@/components/ui/dialog";

export interface OrgRates {
  group_rate: number;
  one_on_one_rate: number;
}

export const DEFAULT_ORG_RATES: OrgRates = { group_rate: 0, one_on_one_rate: 0 };

/** 导入课次的类型判定：名称含「班」为班课，否则为 1V1 */
export function isGroupClass(name: string): boolean {
  return name.includes("班");
}

/** 单节导入课次的课时费 = 时长(小时) × 对应费率 */
export function importedLessonFee(
  className: string,
  start: string,
  end: string,
  rates: OrgRates,
): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const hours = (eh * 60 + em - sh * 60 - sm) / 60;
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const rate = isGroupClass(className) ? rates.group_rate : rates.one_on_one_rate;
  return hours * (Number(rate) || 0);
}

export function OrgRateButton({
  userId,
  rates,
  onSaved,
}: {
  userId: string | undefined;
  rates: OrgRates;
  onSaved: (r: OrgRates) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(String(rates.group_rate));
  const [solo, setSolo] = useState(String(rates.one_on_one_rate));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setGroup(String(rates.group_rate));
      setSolo(String(rates.one_on_one_rate));
    }
  }, [open, rates]);

  const save = async () => {
    if (!userId) return;
    const g = Number(group) || 0;
    const s = Number(solo) || 0;
    setBusy(true);
    const { error } = await supabase
      .from("teacher_org_rates")
      .upsert(
        { user_id: userId, group_rate: g, one_on_one_rate: s },
        { onConflict: "user_id" },
      );
    setBusy(false);
    if (error) {
      toast.error("保存失败：" + error.message);
      return;
    }
    toast.success("机构课时费已保存，并同步到全部导入课次");
    onSaved({ group_rate: g, one_on_one_rate: s });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Coins className="h-4 w-4" />
          机构课时费
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>机构课时费设置</DialogTitle>
          <DialogDescription>
            导入课表的课次会按名称自动判定：名称中包含「班」为班课，其余为
            1V1。费率按每小时计算，保存后同步到所有导入课次。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-group-rate">班课课时费（元/小时）</Label>
            <Input
              id="org-group-rate"
              type="number"
              min={0}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-solo-rate">1V1 课时费（元/小时）</Label>
            <Input
              id="org-solo-rate"
              type="number"
              min={0}
              value={solo}
              onChange={(e) => setSolo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
