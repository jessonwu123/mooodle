import { useEffect, useState, type ReactElement } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, RefreshCw, BarChart3 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  getLearningAnalytics,
  generateLearningAnalytics,
} from "@/lib/learning-analytics.functions";

type ChartData = {
  lessonsTrend?: Array<{
    date: string;
    lesson?: string;
    focus: number;
    interaction: number;
    discipline: number;
    accuracy: number;
    overall?: number | null;
    progress?: number | null;
  }>;
  tagPerformance?: Array<{
    tag: string;
    category: string;
    total: number;
    correct: number;
    accuracy: number;
  }>;
  summary?: {
    lessonCount: number;
    attemptCount: number;
    correctCount: number;
    accuracyPct: number;
  };
};

function renderMarkdown(md: string) {
  // light-weight: split into lines, render ##/### headings, paragraphs, list items
  const lines = md.split("\n");
  const out: JSX.Element[] = [];
  let listBuf: string[] = [];
  const flushList = () => {
    if (listBuf.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="mb-3 list-disc space-y-1 pl-6 text-sm text-foreground">
        {listBuf.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      flushList();
      out.push(
        <h3 key={out.length} className="mt-5 mb-2 text-base font-semibold text-foreground">
          {line.replace(/^##\s+/, "")}
        </h3>,
      );
    } else if (/^###\s+/.test(line)) {
      flushList();
      out.push(
        <h4 key={out.length} className="mt-3 mb-1 text-sm font-semibold text-foreground">
          {line.replace(/^###\s+/, "")}
        </h4>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      listBuf.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      out.push(
        <p key={out.length} className="mb-2 text-sm leading-relaxed text-foreground">
          {line}
        </p>,
      );
    }
  }
  flushList();
  return out;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function LearningAnalyticsTab({ studentId }: { studentId: string }) {
  const getFn = useServerFn(getLearningAnalytics);
  const genFn = useServerFn(generateLearningAnalytics);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState("");
  const [chartData, setChartData] = useState<ChartData>({});
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getFn({ data: { studentId } });
        setContent(res.content);
        setChartData(res.chartData ?? {});
        setGeneratedAt(res.generatedAt);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId, getFn]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await genFn({ data: { studentId } });
      setContent(res.content);
      setChartData(res.chartData ?? {});
      setGeneratedAt(res.generatedAt);
      toast.success("分析已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  const trend = chartData.lessonsTrend ?? [];
  const tagPerf = chartData.tagPerformance ?? [];
  const summary = chartData.summary;
  const hasData = !!generatedAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <div className="text-base font-semibold text-foreground">AI 学习情况分析</div>
            <div className="text-xs text-muted-foreground">
              {generatedAt
                ? `最近更新于 ${new Date(generatedAt).toLocaleString("zh-CN")}`
                : "尚未生成分析"}
            </div>
          </div>
        </div>
        <Button onClick={handleGenerate} disabled={generating} size="sm">
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : hasData ? (
            <RefreshCw className="mr-2 h-4 w-4" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {hasData ? "重新生成分析" : "生成分析"}
        </Button>
      </div>

      {!hasData ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          点击"生成分析"按钮，AI 将基于课堂记录、综合素质评估与习题表现，为该学生生成多维度学习分析。
        </div>
      ) : (
        <>
          {summary && (
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="课堂节数" value={summary.lessonCount} />
              <StatCard label="累计答题" value={summary.attemptCount} />
              <StatCard label="答对题数" value={summary.correctCount} tone="positive" />
              <StatCard label="整体正确率" value={`${summary.accuracyPct}%`} tone="primary" />
            </div>
          )}

          {trend.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">课堂表现趋势</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trend.map((t) => ({ ...t, date: fmtDate(t.date) }))}
                    margin={{ top: 5, right: 10, bottom: 5, left: -10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="focus" name="专注力" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="interaction" name="互动性" stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="discipline" name="课堂纪律" stroke="#f59e0b" strokeWidth={2} />
                    <Line type="monotone" dataKey="accuracy" name="做题准确率" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {tagPerf.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <h3 className="mb-1 text-sm font-semibold text-foreground">知识点掌握情况</h3>
              <p className="mb-4 text-xs text-muted-foreground">按答题次数排序，柱状颜色反映正确率</p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={tagPerf}
                    margin={{ top: 5, right: 10, bottom: 40, left: -10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="tag"
                      tick={{ fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip
                      formatter={(v: any, n: any, p: any) =>
                        n === "accuracy"
                          ? [`${v}%（${p.payload.correct}/${p.payload.total}）`, "正确率"]
                          : [v, n]
                      }
                    />
                    <Bar dataKey="accuracy" name="正确率">
                      {tagPerf.map((t, i) => (
                        <Cell
                          key={i}
                          fill={t.accuracy >= 75 ? "#10b981" : t.accuracy >= 50 ? "#f59e0b" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {content && (
            <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">AI 分析报告</h3>
              </div>
              <div>{renderMarkdown(content)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "primary" | "positive";
}) {
  const color =
    tone === "primary" ? "text-primary" : tone === "positive" ? "text-emerald-600" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
