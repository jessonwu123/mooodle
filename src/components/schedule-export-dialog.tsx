import { useEffect, useMemo, useState } from "react";
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

export function ScheduleExportDialog({
  entries,
  defaultStart,
  defaultEnd,
}: {
  entries: ExportEntry[];
  defaultStart?: string;
  defaultEnd?: string;
}) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(toISO(startOfWeek(today)));
  const [end, setEnd] = useState(() => {
    const e = startOfWeek(today);
    e.setDate(e.getDate() + 27);
    return toISO(e);
  });

  useEffect(() => {
    if (open && defaultStart) setStart(defaultStart);
    if (open && defaultEnd) setEnd(defaultEnd);
  }, [open, defaultStart, defaultEnd]);

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

  const [busy, setBusy] = useState(false);

  const pageHtml = (
    pageWeeks: typeof weeks,
    title: string,
    pageNo: number,
    pageTotal: number,
  ) => {
    const rows = pageWeeks
      .map((w) => {
        const cells = w.days
          .map((d) => {
            const list = d.items
              .map(
                (it) =>
                  `<div style="border-radius:3px;background:#eef3ff;padding:2px 4px;margin-bottom:2px;line-height:1.35;word-break:break-word;"><div style="font-weight:700;white-space:nowrap;">${esc(it.timeLabel)}</div><div>${esc(it.title)}</div></div>`,
              )
              .join("");

            return `<td style="border:1px solid #999;vertical-align:top;padding:4px;font-size:11px;">
              <div style="color:#888;font-size:10px;margin-bottom:2px;">${d.date.getMonth() + 1}/${d.date.getDate()}</div>${list}</td>`;
          })
          .join("");
        const ws = w.weekStart;
        return `<tr><th style="border:1px solid #999;width:58px;background:#fafafa;text-align:center;font-size:11px;font-weight:600;">${ws.getMonth() + 1}/${ws.getDate()}<br/><span style="font-weight:400;color:#888;font-size:9px;">起</span></th>${cells}</tr>`;
      })
      .join("");
    return `<div style="width:1080px;padding:24px;background:#fff;color:#111;box-sizing:border-box;font-family:'PingFang SC','Microsoft YaHei','Heiti SC',sans-serif;">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px;">${esc(title)}</div>
      <div style="font-size:12px;color:#666;margin-bottom:10px;">共 ${weeks.length} 周 / ${lessonCount} 节课 · 第 ${pageNo}/${pageTotal} 页</div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr>
          <th style="border:1px solid #999;width:58px;background:#f2f2f2;font-size:12px;padding:4px;">周次</th>
          ${WEEKDAYS.map((w) => `<th style="border:1px solid #999;background:#f2f2f2;font-size:12px;padding:4px;">${w}</th>`).join("")}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  };

  const handleExport = async () => {
    if (parseISO(end) < parseISO(start)) {
      toast.error("结束日期不能早于开始日期");
      return;
    }
    setBusy(true);
    const title = `课程表 ${start} 至 ${end}`;
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro"),
      ]);
      const perPage = 6;
      const pages: (typeof weeks)[] = [];
      for (let i = 0; i < weeks.length; i += perPage) {
        pages.push(weeks.slice(i, i + perPage));
      }
      if (pages.length === 0) pages.push([]);

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      const host = document.createElement("div");
      host.style.cssText =
        "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;";
      document.body.appendChild(host);

      for (let i = 0; i < pages.length; i++) {
        host.innerHTML = pageHtml(pages[i]!, title, i + 1, pages.length);
        const canvas = await html2canvas(host.firstElementChild as HTMLElement, {
          scale: 2,
          backgroundColor: "#ffffff",
        });
        const img = canvas.toDataURL("image/jpeg", 0.92);
        const margin = 6;
        const maxW = pw - margin * 2;
        const maxH = ph - margin * 2;
        let w = maxW;
        let h = (canvas.height / canvas.width) * w;
        if (h > maxH) {
          h = maxH;
          w = (canvas.width / canvas.height) * h;
        }
        if (i > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", (pw - w) / 2, margin, w, h);
      }

      host.remove();
      pdf.save(`${title}.pdf`);
      setOpen(false);
    } catch (err) {
      toast.error(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
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
            {lessonCount} 节课。点击导出将直接下载 PDF 文件。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={busy} className="gap-1.5">
            <FileDown className="h-4 w-4" />
            {busy ? "生成中..." : "下载 PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
