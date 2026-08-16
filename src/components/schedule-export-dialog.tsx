import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

export interface ExportEntry {
  date: Date;
  timeLabel: string;
  title: string;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function toISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

export function ScheduleExportDialog({ entries }: { entries: ExportEntry[] }) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(toISO(startOfWeek(today)));
  const [end, setEnd] = useState(() => {
    const e = startOfWeek(today);
    e.setDate(e.getDate() + 27);
    return toISO(e);
  });

  const weeks = useMemo(() => {
    const s = startOfWeek(parseISO(start));
    const e = parseISO(end);
    e.setHours(23, 59, 59, 999);
    const out: { weekStart: Date; days: { date: Date; items: ExportEntry[] }[] }[] = [];
    let cur = s;
    let guard = 0;
    while (cur <= e && guard++ < 200) {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(cur);
        d.setDate(cur.getDate() + i);
        return {
          date: d,
          items: entries
            .filter(
              (x) =>
                x.date.getFullYear() === d.getFullYear() &&
                x.date.getMonth() === d.getMonth() &&
                x.date.getDate() === d.getDate(),
            )
            .sort((a, b) => a.date.getTime() - b.date.getTime()),
        };
      });
      out.push({ weekStart: new Date(cur), days });
      const next = new Date(cur);
      next.setDate(cur.getDate() + 7);
      cur = next;
    }
    return out;
  }, [entries, start, end]);

  const lessonCount = weeks.reduce(
    (n, w) => n + w.days.reduce((m, d) => m + d.items.length, 0),
    0,
  );

  const handleExport = () => {
    if (parseISO(end) < parseISO(start)) {
      toast.error("结束日期不能早于开始日期");
      return;
    }
    const title = `课程表 ${start} 至 ${end}`;
    const rows = weeks
      .map((w) => {
        const cells = w.days
          .map((d) => {
            const list = d.items
              .map(
                (it) =>
                  `<div class="ev"><b>${esc(it.timeLabel)}</b> ${esc(it.title)}</div>`,
              )
              .join("");
            return `<td><div class="dn">${d.date.getMonth() + 1}/${d.date.getDate()}</div>${list}</td>`;
          })
          .join("");
        const ws = w.weekStart;
        return `<tr><th class="wk">${ws.getMonth() + 1}/${ws.getDate()}<br/><span>那一周</span></th>${cells}</tr>`;
      })
      .join("");

    const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
body { font-family: "PingFang SC","Microsoft YaHei","Heiti SC",sans-serif; color:#111; }
h1 { font-size: 16px; margin: 0 0 4px; }
.sub { font-size: 11px; color:#666; margin-bottom: 8px; }
table { width:100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid #999; vertical-align: top; padding: 4px; font-size: 10px; }
thead th { background:#f2f2f2; text-align:center; font-size: 11px; }
th.wk { width: 52px; background:#fafafa; text-align:center; font-weight:600; }
th.wk span { font-weight:400; color:#888; font-size:9px; }
.dn { color:#888; font-size:9px; margin-bottom:2px; }
.ev { border-radius:3px; background:#eef3ff; padding:2px 3px; margin-bottom:2px; line-height:1.3; word-break:break-word; }
tr { page-break-inside: avoid; }
</style></head><body>
<h1>${esc(title)}</h1>
<div class="sub">共 ${weeks.length} 周 / ${lessonCount} 节课</div>
<table><thead><tr><th class="wk">周次</th>${WEEKDAYS.map((w) => `<th>${w}</th>`).join("")}</tr></thead>
<tbody>${rows}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print();},200);}<\/script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      toast.error("浏览器拦截了新窗口，请允许弹出窗口后重试");
      return;
    }
    w.document.write(html);
    w.document.close();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileDown className="h-4 w-4" />
          导出 PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>导出课表 PDF</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-start">开始日期</Label>
              <Input
                id="exp-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-end">结束日期</Label>
              <Input
                id="exp-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "本月", days: 30 },
              { label: "3 个月", days: 90 },
              { label: "6 个月", days: 180 },
            ].map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const s = startOfWeek(new Date());
                  const e = new Date(s);
                  e.setDate(s.getDate() + p.days);
                  setStart(toISO(s));
                  setEnd(toISO(e));
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            表格每一行代表一周（周日至周六），当前范围共 {weeks.length} 周、
            {lessonCount} 节课。点击导出后将打开打印窗口，选择「另存为 PDF」即可。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleExport} className="gap-1.5">
            <FileDown className="h-4 w-4" />
            导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
