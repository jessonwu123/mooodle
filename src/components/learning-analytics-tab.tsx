import { useEffect, useState, type ReactElement } from "react";
import { TagAccuracyPanel } from "@/components/tag-accuracy-panel";
import { ExamPracticeStatsPanel } from "@/components/exam-practice-stats-panel";
import { UpgradeNotice } from "@/components/upgrade-dialog";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  BarChart3,
  Send,
  Save,
  Pencil,
  Eye,
  Trash2,
  FileText,
  ChevronDown,
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  getLearningAnalytics,
  generateLearningAnalytics,
  updateLearningAnalyticsContent,
  publishLearningAnalytics,
  deleteLearningAnalyticsArchive,
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

type Archive = {
  id: string;
  content: string;
  chartData: ChartData;
  publishedAt: string;
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

function LearningAnalyticsInner({
  studentId,
  isOwnerView = false,
}: {
  studentId: string;
  isOwnerView?: boolean;
}) {
  const getFn = useServerFn(getLearningAnalytics);
  const genFn = useServerFn(generateLearningAnalytics);
  const saveFn = useServerFn(updateLearningAnalyticsContent);
  const publishFn = useServerFn(publishLearningAnalytics);
  const deleteFn = useServerFn(deleteLearningAnalyticsArchive);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [role, setRole] = useState<"student" | "teacher">("student");
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [draftChart, setDraftChart] = useState<ChartData>({});
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [archives, setArchives] = useState<Archive[]>([]);
  // null = 显示草稿（仅教师端），string = 选中归档 id
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isTeacherView = !isOwnerView;

  const load = async () => {
    setLoading(true);
    try {
      const res = await getFn({ data: { studentId } });
      setRole(res.role);
      setContent(res.content);
      setDraft(res.content);
      setDraftChart(res.chartData ?? {});
      setGeneratedAt(res.generatedAt);
      setArchives(res.archives ?? []);
      // 默认全部折叠
      setSelectedId(isOwnerView ? null : 'none');
      setExpandedId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await genFn({ data: { studentId } });
      setContent(res.content);
      setDraft(res.content);
      setDraftChart(res.chartData ?? {});
      setGeneratedAt(res.generatedAt);
      toast.success("AI 分析已生成，点击下方草稿条目查看");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { studentId, content: draft } });
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
      await publishFn({ data: { studentId } });
      toast.success("已发送给学生，已存档");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这次发送的存档吗？学生将无法再看到该次分析。")) return;
    try {
      await deleteFn({ data: { studentId, archiveId: id } });
      toast.success("已删除");
      if (selectedId === id) setSelectedId('none');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  // 学生端：没有任何已发送的存档
  if (isOwnerView && archives.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
        老师尚未发送学习情况分析报告，请稍后再来查看。
      </div>
    );
  }

  const selectedArchive = selectedId && selectedId !== 'none'
    ? archives.find((a) => a.id === selectedId)
    : null;
  const displayContent = selectedArchive?.content ?? "";
  const displayChart: ChartData = selectedArchive?.chartData ?? {};

  const trend = displayChart.lessonsTrend ?? [];
  const tagPerf = displayChart.tagPerformance ?? [];
  const summary = displayChart.summary;

  return (
    <div className="space-y-6">
      {/* 顶部操作栏（仅教师端） */}
      {isTeacherView && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-foreground">AI 学习情况分析</div>
                {selectedArchive ? (
                  <Badge variant="secondary" className="text-xs">
                    当前：历史存档
                  </Badge>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedArchive
                  ? `存档于 ${fmtDateTime(selectedArchive.publishedAt)}`
                  : generatedAt
                    ? `草稿更新于 ${fmtDateTime(generatedAt)}（点击下方"当前草稿"全屏查看）`
                    : "尚未生成分析"}
                {archives.length > 0 && (
                  <span className="ml-2">· 共 {archives.length} 次发送</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/analysis/$id" params={{ id: studentId }}>
              <Button size="sm" variant="outline">
                打开草稿
              </Button>
            </Link>
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
              <Link
                to="/admin/analysis/$id"
                params={{ id: studentId }}
                search={{ edit: true }}
              >
                <Button size="sm" variant="outline">
                  <Pencil className="mr-2 h-4 w-4" /> 编辑
                </Button>
              </Link>
            )}
            <Button onClick={handlePublish} disabled={publishing || !content} size="sm">
              {publishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              发送给学生
            </Button>
          </div>
        </div>
      )}

      {/* 历史发送记录列表 */}
      {(archives.length > 0 || (isTeacherView && content)) && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {isTeacherView ? "分析报告存档" : "学习分析报告（历史发送）"}
            </h3>
          </div>
          <div className="space-y-2">
            {/* 草稿条目（仅教师端）— 点击跳转到全屏 */}
            {isTeacherView && content && (
              <Link
                to="/admin/analysis/$id"
                params={{ id: studentId }}
                className="block rounded-xl border border-border bg-background px-3 py-2 transition hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {generatedAt ? `草稿（${fmtDateTime(generatedAt)}）` : "当前草稿"}
                  </div>
                  <Badge variant="outline" className="text-xs">草稿</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">点击全屏查看 →</span>
                </div>
                <div className="line-clamp-1 text-xs text-muted-foreground">
                  {draft.replace(/[#*\->]/g, "").slice(0, 80) || "暂无内容"}
                </div>
              </Link>
            )}
            {archives.map((a) => {
              const active = selectedId === a.id;
              const isExpanded = expandedId === a.id;
              if (isOwnerView) {
                return (
                  <div
                    key={a.id}
                    className="overflow-hidden rounded-xl border border-border bg-background transition"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {fmtDateTime(a.publishedAt)}
                        </div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {a.content.replace(/[#*\->]/g, "").slice(0, 80)}
                        </div>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border px-3 pb-4 pt-3">
                        {a.chartData?.summary && (
                          <div className="mb-4 grid gap-3 sm:grid-cols-4">
                            <StatCard label="课堂节数" value={a.chartData.summary.lessonCount} />
                            <StatCard label="累计答题" value={a.chartData.summary.attemptCount} />
                            <StatCard label="答对题数" value={a.chartData.summary.correctCount} tone="positive" />
                            <StatCard label="整体正确率" value={`${a.chartData.summary.accuracyPct}%`} tone="primary" />
                          </div>
                        )}

                        {a.chartData?.lessonsTrend && a.chartData.lessonsTrend.length > 0 && (
                          <section className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                            <h3 className="mb-4 text-sm font-semibold text-foreground">课堂表现趋势</h3>
                            <div className="h-72 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                  data={a.chartData.lessonsTrend.map((t) => ({ ...t, date: fmtDate(t.date) }))}
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

                        {a.chartData?.tagPerformance && a.chartData.tagPerformance.length > 0 && (
                          <section className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                            <h3 className="mb-1 text-sm font-semibold text-foreground">知识点掌握情况</h3>
                            <p className="mb-4 text-xs text-muted-foreground">按答题次数排序，柱状颜色反映正确率</p>
                            <div className="h-72 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={a.chartData.tagPerformance} margin={{ top: 5, right: 10, bottom: 40, left: -10 }}>
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
                                  <Legend wrapperStyle={{ fontSize: 12 }} />
                                  <Bar dataKey="accuracy" name="正确率">
                                    {a.chartData.tagPerformance.map((t, i) => (
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
                            <h3 className="text-sm font-semibold text-foreground">学习分析报告</h3>
                          </div>
                          <div>{renderMarkdown(a.content)}</div>
                        </section>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={a.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="flex-1 text-left"
                  >
                    <div className="text-sm font-medium text-foreground">
                      {fmtDateTime(a.publishedAt)}
                    </div>
                    <div className="line-clamp-1 text-xs text-muted-foreground">
                      {a.content.replace(/[#*\->]/g, "").slice(0, 80)}
                    </div>
                  </button>
                  {active && (
                    <Badge variant="secondary" className="text-xs">
                      查看中
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(a.id)}
                    title="删除该次存档"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 内容主体 */}
      {isTeacherView && !displayContent ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          {content ? "请点击下方草稿或历史存档条目查看分析报告" : '点击"AI 生成"按钮，AI 将基于课堂记录、综合素质评估与习题表现生成分析草稿；老师确认或修改后点击"发送给学生"，每次发送都会自动存档。'}
        </div>
      ) : isTeacherView ? (
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
                {isTeacherView ? "AI 分析报告" : "学习分析报告"}
              </h3>
            </div>
            <div>{renderMarkdown(displayContent)}</div>
          </section>
        </>
      ) : null}
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

export function LearningAnalyticsTab(props: { studentId: string; isOwnerView?: boolean; limited?: boolean }) {
  if (props.limited) return <UpgradeNotice />;
  return (
    <div className="space-y-6">
      <ExamPracticeStatsPanel studentId={props.studentId} />
      <TagAccuracyPanel studentId={props.studentId} />
      <LearningAnalyticsInner {...props} />
    </div>
  );
}
