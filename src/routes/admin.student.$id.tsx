import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Calendar, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/admin/student/$id")({
  component: ManageStudent,
});

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
}

const dimensions = [
  { key: "focus" as const, label: "专注力" },
  { key: "interaction" as const, label: "互动性" },
  { key: "discipline" as const, label: "课堂纪律" },
  { key: "accuracy" as const, label: "做题准确率" },
];

const today = () => new Date().toISOString().slice(0, 10);

function ManageStudent() {
  const { id } = Route.useParams();
  const [student, setStudent] = useState<{ name: string } | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from("students").select("name").eq("id", id).maybeSingle(),
      supabase
        .from("ratings")
        .select("id, lesson_date, lesson_name, summary, overall_assessment, focus, interaction, discipline, accuracy")
        .eq("student_id", id)
        .order("lesson_date", { ascending: false }),
    ]);
    setStudent(s);
    setRatings(r ?? []);
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
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("ratings").insert({
      student_id: id,
      lesson_date: date,
      lesson_name: lessonName.trim() || null,
      summary: summary.trim() || null,
      overall_assessment: overall,
      ...scores,
      created_by: userData.user?.id,
    });
    setBusy(false);
    if (error) {
      toast.error("保存失败：" + error.message);
      return;
    }
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

      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">学生档案</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {student?.name}
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">
            共 {ratings.length} 节课
          </div>
        </div>
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

              <div className="space-y-3">
                {dimensions.map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3"
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
                <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">
                    整体表现评估
                  </span>
                  <StarRating value={overall} onChange={setOverall} />
                </div>
              </div>

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
              {r.summary && (
                <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {r.summary}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
