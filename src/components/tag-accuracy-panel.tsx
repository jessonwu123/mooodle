import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Target } from "lucide-react";
import { getTagAccuracy } from "@/lib/practice.functions";

type Row = { id: string; name: string; category: string; parent_id: string | null; total: number; correct: number };

function Bar({ row, child }: { row: Row; child?: boolean }) {
  const pct = row.total ? Math.round((row.correct / row.total) * 100) : 0;
  const tone = pct >= 80 ? "bg-primary" : pct >= 60 ? "bg-primary/60" : "bg-destructive";
  return (
    <div className={child ? "ml-5" : ""}>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className={child ? "text-muted-foreground" : "font-medium text-foreground"}>
          {child ? "└ " : ""}{row.name}
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{pct}%</span>（{row.correct}/{row.total} 题）
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TagAccuracyPanel({ studentId }: { studentId: string }) {
  const fn = useServerFn(getTagAccuracy);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fn({ data: { studentId } }).then((r) => setRows(r.tags as Row[])).catch(() => setRows([]));
  }, [studentId, fn]);

  const byCat = (cat: "calc" | "other") => {
    const list = (rows ?? []).filter((r) => (cat === "calc" ? r.category === "calc" : r.category !== "calc"));
    const ids = new Set(list.map((r) => r.id));
    const roots = list.filter((r) => !r.parent_id || !ids.has(r.parent_id)).sort((a, b) => b.total - a.total);
    return roots.map((r) => ({ root: r, kids: list.filter((c) => c.parent_id === r.id).sort((a, b) => b.total - a.total) }));
  };

  const section = (title: string, groups: ReturnType<typeof byCat>) =>
    groups.length > 0 && (
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        {groups.map((g) => (
          <div key={g.root.id} className="space-y-2">
            <Bar row={g.root} />
            {g.kids.map((k) => <Bar key={k.id} row={k} child />)}
          </div>
        ))}
      </div>
    );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">习题练习 · 各知识点正确率</h2>
      </div>
      {rows === null ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">还没有习题练习记录。</p>
      ) : (
        <div className="space-y-6">
          {section("计算练习", byCat("calc"))}
          {section("题库知识点", byCat("other"))}
        </div>
      )}
    </section>
  );
}
