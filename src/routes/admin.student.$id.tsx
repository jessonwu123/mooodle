import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Calendar, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComprehensiveAssessment } from "@/components/comprehensive-assessment";
import { CourseInfoPanel } from "@/components/course-info-panel";
import type { AssessmentTimestamps } from "@/lib/assessment-updates";

export const Route = createFileRoute("/admin/student/$id")({
  component: ManageStudent,
});

interface ProgressItem {
  id?: string;
  item_name: string;
  percentage: number;
  sort_order: number;
}

interface Rating {
  id: string;
  lesson_date: string;
  lesson_name: string | null;
  summary: string | null;
  overall_assessment: number | null;
  focus: number;
  interaction: number;
  discipline: number;
  accuracy: number;
  overall_progress: number | null;
  progress_items: ProgressItem[];
}

const dimensions = [
  { key: "focus" as const, label: "专注力" },
  { key: "interaction" as const, label: "互动性" },
  { key: "discipline" as const, label: "课堂纪律" },
  { key: "accuracy" as const, label: "做题准确率" },
];

const today = () => new Date().toISOString().slice(0, 10);

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function ManageStudent() {
  const { id } = Route.useParams();
  const [student, setStudent] = useState<{ name: string } | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [timestamps, setTimestamps] = useState<AssessmentTimestamps>({
    knowledge: null,
    thinking: null,
    learning_quality: null,
  });

  const [date, setDate] = useState(today());
  const [lessonName, setLessonName] = useState("");
  const [summary, setSummary] = useState("");
  const [overall, setOverall] = useState(5);
  const [scores, setScores] = useState({
    focus: 5,
    interaction: 5,
    discipline: 5,
    accuracy: 5,
  });
  const [overallProgress, setOverallProgress] = useState<number>(80);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase
        .from("students")
        .select("name, knowledge_updated_at, thinking_updated_at, learning_quality_updated_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("ratings")
        .select(
          "id, lesson_date, lesson_name, summary, overall_assessment, focus, interaction, discipline, accuracy, overall_progress, progress_items(id, item_name, percentage, sort_order)",
        )
        .eq("student_id", id)
        .order("lesson_date", { ascending: false }),
    ]);
    if (s) {
      setStudent({ name: s.name });
      setTimestamps({
        knowledge: s.knowledge_updated_at,
        thinking: s.thinking_updated_at,
        learning_quality: s.learning_quality_updated_at,
      });
    } else {
      setStudent(null);
    }
    const normalized = ((r ?? []) as unknown as Rating[]).map((row) => ({
      ...row,
      progress_items: (row.progress_items ?? []).slice().sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    }));
    setRatings(normalized);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const resetForm = () => {
    setDate(today());
    setLessonName("");
    setSummary("");
    setOverall(5);
    setScores({ focus: 5, interaction: 5, discipline: 5, accuracy: 5 });
    setOverallProgress(80);
    setProgressItems([]);
  };

  const addProgressRow = () => {
    setProgressItems((prev) => [
      ...prev,
      { item_name: "", percentage: 80, sort_order: prev.length },
    ]);
  };

  const updateProgressRow = (idx: number, patch: Partial<ProgressItem>) => {
    setProgressItems((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeProgressRow = (idx: number) => {
    setProgressItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from("ratings")
      .insert({
        student_id: id,
        lesson_date: date,
        lesson_name: lessonName.trim() || null,
        summary: summary.trim() || null,
        overall_assessment: overall,
        ...scores,
        overall_progress: clampPct(overallProgress),
        created_by: userData.user?.id,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      setBusy(false);
      toast.error("保存失败：" + (error?.message ?? ""));
      return;
    }
    const validItems = progressItems
      .map((p, i) => ({
        rating_id: inserted.id,
        item_name: p.item_name.trim(),
        percentage: clampPct(p.percentage),
        sort_order: i,
        created_by: userData.user?.id,
      }))
      .filter((p) => p.item_name.length > 0);
    if (validItems.length > 0) {
      const { error: piErr } = await supabase.from("progress_items").insert(validItems);
      if (piErr) {
        toast.error("知识点保存失败：" + piErr.message);
      }
    }
    setBusy(false);
    toast.success("已保存课堂评分");
    setOpen(false);
    resetForm();
    load();
  };

  const handleDelete = async (rid: string) => {
    const { error } = await supabase.from("ratings").delete().eq("id", rid);
    if (error) {
      toast.error("删除失败");
      return;
    }
    toast.success("已删除");
    load();
  };

  if (loading) {
    return (
      <div className="text-center text-sm text-muted-foreground">加载中...</div>
    );
  }

  return (
    <div>
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回学生列表
      </Link>

      <div className="mb-8">
        <div className="text-sm text-muted-foreground">学生档案</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          {student?.name}
        </h1>
        <div className="mt-1 text-sm text-muted-foreground">
          共 {ratings.length} 节课
        </div>
      </div>

      <Tabs defaultValue="lessons" className="w-full">
        <TabsList className="mb-6 grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="lessons">课堂记录</TabsTrigger>
          <TabsTrigger value="comprehensive">综合素质</TabsTrigger>
          <TabsTrigger value="course">课程信息</TabsTrigger>
        </TabsList>

        <TabsContent value="lessons">
          <div className="mb-6 flex justify-end">
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button className="gap-1.5 bg-green-500 text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-green-600">
                  <Plus className="h-4 w-4" />
                  新增课堂评分
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>新增课堂评分</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="date">上课日期</Label>
                      <Input
                        id="date"
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lessonName">本节课名称</Label>
                      <Input
                        id="lessonName"
                        placeholder="如：分数加减法"
                        value={lessonName}
                        onChange={(e) => setLessonName(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* 学生表现 */}
                  <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                    <div className="text-sm font-semibold text-foreground">学生表现</div>
                    {dimensions.map((d) => (
                      <div
                        key={d.key}
                        className="flex items-center justify-between rounded-lg bg-background/70 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-foreground">
                          {d.label}
                        </span>
                        <StarRating
                          value={scores[d.key]}
                          onChange={(v) =>
                            setScores((s) => ({ ...s, [d.key]: v }))
                          }
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                      <span className="text-sm font-semibold text-foreground">
                        整体表现评估
                      </span>
                      <StarRating value={overall} onChange={setOverall} />
                    </div>
                  </section>

                  {/* 授课进度 */}
                  <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">授课进度</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addProgressRow}
                        className="h-7 gap-1 px-2 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        添加知识点
                      </Button>
                    </div>

                    {progressItems.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        暂无知识点，点击上方"添加知识点"
                      </div>
                    )}
                    {progressItems.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg bg-background/70 px-2 py-2"
                      >
                        <Input
                          value={p.item_name}
                          onChange={(e) =>
                            updateProgressRow(i, { item_name: e.target.value })
                          }
                          placeholder="知识点名称"
                          className="h-8 flex-1"
                        />
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={p.percentage}
                            onChange={(e) =>
                              updateProgressRow(i, {
                                percentage: clampPct(Number(e.target.value)),
                              })
                            }
                            className="h-8 w-16 text-right"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeProgressRow(i)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                      <span className="text-sm font-semibold text-foreground">
                        整体吸收程度
                      </span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={overallProgress}
                          onChange={(e) =>
                            setOverallProgress(clampPct(Number(e.target.value)))
                          }
                          className="h-8 w-16 text-right"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  </section>

                  <div className="space-y-2">
                    <Label htmlFor="summary">课堂总结</Label>
                    <Textarea
                      id="summary"
                      rows={4}
                      placeholder="本节课内容、亮点、需改进之处等"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                    />
                  </div>

                  <DialogFooter>
                    <Button type="submit" disabled={busy}>
                      {busy ? "保存中..." : "保存评分"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {ratings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
              暂无评分，点击右上角新增第一节课
            </div>
          ) : (
            <div className="space-y-3">
              {ratings.map((r) => (
                <article
                  key={r.id}
                  className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Calendar className="h-4 w-4 text-primary" />
                        {new Date(r.lesson_date).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                      {r.lesson_name && (
                        <div className="mt-1 text-base font-semibold text-foreground">
                          {r.lesson_name}
                        </div>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除该评分记录？</AlertDialogTitle>
                          <AlertDialogDescription>此操作无法撤销。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(r.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            确认删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    学生表现
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {dimensions.map((d) => (
                      <div
                        key={d.key}
                        className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                      >
                        <span className="text-sm text-muted-foreground">{d.label}</span>
                        <StarRating value={r[d.key]} size="sm" readOnly />
                      </div>
                    ))}
                    {r.overall_assessment != null && (
                      <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 sm:col-span-2">
                        <span className="text-sm font-semibold text-foreground">整体表现</span>
                        <StarRating value={r.overall_assessment} size="sm" readOnly />
                      </div>
                    )}
                  </div>

                  {(r.progress_items.length > 0 || r.overall_progress != null) && (
                    <>
                      <div className="mt-4 mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        授课进度
                      </div>
                      <div className="space-y-2">
                        {r.progress_items.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                          >
                            <span className="text-sm text-foreground">{p.item_name}</span>
                            <span className="text-sm font-semibold text-primary">
                              {p.percentage}%
                            </span>
                          </div>
                        ))}
                        {r.overall_progress != null && (
                          <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                            <span className="text-sm font-semibold text-foreground">
                              整体吸收程度
                            </span>
                            <span className="text-sm font-bold text-primary">
                              {r.overall_progress}%
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {r.summary && (
                    <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
                      {r.summary}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comprehensive">
          <ComprehensiveAssessment
            studentId={id}
            editable={true}
            timestamps={timestamps}
            onTimestampChange={(cat, at) =>
              setTimestamps((prev) => ({ ...prev, [cat]: at }))
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
