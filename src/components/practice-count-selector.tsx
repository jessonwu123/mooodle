import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parsePracticeCount } from "@/lib/practice-count";

export function PracticeCountSelector({ value, onChange, maximum = 50, allowAll = false }: {
  value: string;
  onChange: (value: string) => void;
  maximum?: number;
  allowAll?: boolean;
}) {
  const id = useId();
  const all = allowAll && value === "all";
  const invalid = !all && parsePracticeCount(value, maximum) === null;
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-foreground">题目数量</div>
      <div className="flex flex-wrap items-center gap-2">
        {allowAll && <Button type="button" variant={all ? "default" : "outline"} size="sm" onClick={() => onChange("all")}>整卷</Button>}
        {[5, 10, 20, 30].filter((n) => n <= maximum).map((n) => (
          <Button key={n} type="button" size="sm" variant={value === String(n) ? "default" : "outline"} onClick={() => onChange(String(n))}>{n} 题</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>自定义题数</Label>
        <Input id={id} type="number" inputMode="numeric" min={1} max={maximum} step={1} value={all ? "" : value} onChange={(e) => onChange(e.target.value)} placeholder={`1–${maximum}`} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} className="w-24" />
        <span className="text-xs text-muted-foreground">题（最多 {maximum} 题）</span>
      </div>
      {invalid && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">请输入 1–{maximum} 之间的整数</p>}
    </div>
  );
}