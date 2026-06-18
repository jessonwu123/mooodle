import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type ReactElement } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  RefreshCw,
  Send,
  Save,
  Pencil,
  Eye,
} from "lucide-react";
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
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  getLearningAnalytics,
  generateLearningAnalytics,
  updateLearningAnalyticsContent,
  publishLearningAnalytics,
} from "@/lib/learning-analytics.functions";

const searchSchema = z.object({
  edit: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/admin/student/$id/analysis")({
  component: AnalysisDraftPage,
  validateSearch: (s) => searchSchema.parse(s),
});

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
  const lines = md.split("\n");
  const out: ReactElement[] = [];
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

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function AnalysisDraftPage() {
  const { id } = Route.useParams();
  const search = useSearch({ from: "/admin/student/$id/analysis" });
  const navigate = useNavigate();

  const getFn = useServerFn(getLearningAnalytics);
  const genFn = useServerFn(generateLearningAnalytics);
  const saveFn = useServerFn(updateLearningAnalyticsContent);
  const publishFn = useServerFn(publishLearningAnalytics);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [chart, setChart] = useState<ChartData>({});
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(!!search.edit);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getFn({ data: { studentId: id } });
      setContent(res.content);
      setDraft(res.content);
      setChart(res.chartData ?? {});
      setGeneratedAt(res.generatedAt);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await genFn({ data: { studentId: id } });
      setContent(res.content);
      setDraft(res.content);
      setChart(res.chartData ?? {});
      setGeneratedAt(res.generatedAt);
      toast.success("AI 分析已生成，请检查后发送给学生");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { studentId: id, content: draft } });
      setContent(draft);
      setEditMode(false);
      toast.success("已保存修改");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (draft !== content) {
      toast.error("请先保存修改再发送");
      return;
    }
    if (!content) {
      toast.error("尚无内容可发送");
      return;
    }
    setPublishing(true);
    try {
      await publishFn({ data: { studentId: id } });
      toast.success("已发送给学生，已存档");
      navigate({ to: "/admin/student/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setPublishing(false);
    }
  };

  const trend = chart.lessonsTrend ?? [];
  const tagPerf = chart.tagPerformance ?? [];
  const summary = chart.summary;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/admin/student/$id" params={{ id }}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold text-foreground">AI 学习情况分析（草稿）</div>
              <Badge variant="outline" className="text-xs">草稿</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {generatedAt ? `草稿更新于 ${fmtDateTime(generatedAt)}` : "尚未生成分析"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleGenerate} disabled={generating} size="sm" variant="outline">
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : generatedAt ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {generatedAt ? "重新生成" : "AI 生成"}
          </Button>
          {content && (
            <Button
              onClick={() => {
                setEditMode((v) => !v);
                if (!editMode) setDraft(content);
              }}
              size="sm"
              variant="outline"
            >
              {editMode ? (
                <>
                  <Eye className="mr-2 h-4 w-4" /> 预览
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" /> 编辑
                </>
              )}
            </Button>
          )}
          {editMode && (
            <Button onClick={handleSave} disabled={saving || draft === content} size="sm" variant="outline">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存
            </Button>
          )}
          <Button onClick={handlePublish} disabled={publishing || !content} size="sm">
            {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            发送给学生
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : !content ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            点击右上角"AI 生成"按钮，AI 将基于课堂记录、综合素质评估与习题表现生成分析草稿；老师确认或修改后点击"发送给学生"，每次发送都会自动存档。
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
                    <BarChart data={tagPerf} margin={{ top: 5, right: 10, bottom: 40, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="tag" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
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

            <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  {editMode ? "编辑分析报告（Markdown）" : "分析报告草稿"}
                </h3>
              </div>
              {editMode ? (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={28}
                  className="font-mono text-sm"
                  placeholder="可使用 Markdown 语法，## 为章节标题，- 为列表项"
                />
              ) : (
                <div>{renderMarkdown(content)}</div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
