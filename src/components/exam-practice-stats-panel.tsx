import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Lightbulb, Loader2 } from "lucide-react";
import { getExamPracticeStats } from "@/lib/practice.functions";
import { Badge } from "@/components/ui/badge";

export function ExamPracticeStatsPanel({ studentId }: { studentId: string }) {
  const getStats = useServerFn(getExamPracticeStats);
  const { data, isPending, error } = useQuery({ queryKey: ["exam-practice-stats", studentId], queryFn: () => getStats({ data: { studentId } }) });
  return <section aria-label="真题整卷练习统计" className="space-y-4 border-b border-border pb-6">
    <h2 className="flex items-center gap-2 text-base font-semibold"><BookOpen className="h-4 w-4 text-primary" />真题整卷练习统计</h2>
    {isPending ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : error ? <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "统计加载失败"}</p> : !data?.papers.length ? <p className="text-sm text-muted-foreground">暂无已完成的真题整卷练习记录。</p> : <div className="space-y-4">{data.papers.map((paper) => <article key={paper.id} className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{paper.name}</h3>
        <div className="text-sm"><span className="font-semibold text-primary">正确率 {paper.accuracy}%</span><span className="ml-2 text-muted-foreground">{paper.correct}/{paper.total} 题 · {paper.attempts.length} 次整卷</span></div>
      </div>
      <div className="mt-4 divide-y divide-border">{paper.attempts.map((attempt, index) => <details key={attempt.id} open={index === 0} className="py-3">
        <summary className="cursor-pointer text-sm font-medium">{new Date(attempt.completedAt ?? "").toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 正确率 {attempt.accuracy}%（{attempt.correct}/{attempt.total}）</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div><span className="font-medium">错题：</span>{attempt.wrong.length ? attempt.wrong.map((q) => `第 ${q.number} 题`).join("、") : "无，全部答对"}</div>
          {attempt.wrong.length > 0 && <ul className="space-y-2">{attempt.wrong.map((q) => <li key={q.number} className="flex flex-wrap items-center gap-2"><span className="text-destructive">第 {q.number} 题</span>{q.tags.length ? q.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>) : <span className="text-muted-foreground">暂无知识点标签</span>}</li>)}</ul>}
          <div className="flex flex-wrap items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /><span className="font-medium">使用提示：</span>{attempt.hintNumbers === null ? <span className="text-muted-foreground">历史记录未统计</span> : attempt.hintNumbers.length ? attempt.hintNumbers.map((number) => <Badge key={number} variant="outline">第 {number} 题</Badge>) : <span className="text-muted-foreground">未使用</span>}</div>
        </div>
      </details>)}</div>
    </article>)}</div>}
  </section>;
}