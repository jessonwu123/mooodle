import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/star-rating";
import { MeetingNotesImport } from "@/components/meeting-notes-import";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";

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

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  lessonDate: string; // YYYY-MM-DD
  editable: boolean;
  onSaved?: () => void;
  initialSummary?: string;
}

export function LessonRatingDialog({
  open,
  onOpenChange,
  studentId,
  lessonDate,
  editable,
  onSaved,
  initialSummary,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<Rating | null>(null);
  const [busy, setBusy] = useState(false);

  const [lessonName, setLessonName] = useState("");
  const [summary, setSummary] = useState("");
  const [overall, setOverall] = useState(5);
  const [scores, setScores] = useState({ focus: 5, interaction: 5, discipline: 5, accuracy: 5 });
  const [overallProgress, setOverallProgress] = useState(80);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("ratings")
        .select(
          "id, lesson_date, lesson_name, summary, overall_assessment, focus, interaction, discipline, accuracy, overall_progress, progress_items(id, item_name, percentage, sort_order)",
        )
        .eq("student_id", studentId)
        .eq("lesson_date", lessonDate)
        .maybeSingle();
      if (cancelled) return;
      const r = (data as unknown as Rating | null) ?? null;
      setRating(r);
      if (r) {
        setLessonName(r.lesson_name ?? "");
        setSummary(initialSummary ? `${r.summary ? r.summary + "\n\n" : ""}${initialSummary}` : r.summary ?? "");
        setOverall(r.overall_assessment ?? 5);
        setScores({
          focus: r.focus,
          interaction: r.interaction,
          discipline: r.discipline,
          accuracy: r.accuracy,
        });
        setOverallProgress(r.overall_progress ?? 80);
        setProgressItems(
          (r.progress_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
        );
      } else {
        setLessonName("");
        setSummary(initialSummary ?? "");
        setOverall(5);
        setScores({ focus: 5, interaction: 5, discipline: 5, accuracy: 5 });
        setOverallProgress(80);
        setProgressItems([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, studentId, lessonDate, initialSummary]);

  const save = async () => {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;

    let ratingId = rating?.id ?? null;
    if (ratingId) {
      const { error } = await supabase
        .from("ratings")
        .update({
          lesson_name: lessonName.trim() || null,
          summary: summary.trim() || null,
          overall_assessment: overall,
          ...scores,
          overall_progress: clampPct(overallProgress),
        })
        .eq("id", ratingId);
      if (error) {
        setBusy(false);
        toast.error("保存失败：" + error.message);
        return;
      }
      await supabase.from("progress_items").delete().eq("rating_id", ratingId);
    } else {
      const { data: inserted, error } = await supabase
        .from("ratings")
        .insert({
          student_id: studentId,
          lesson_date: lessonDate,
          lesson_name: lessonName.trim() || null,
          summary: summary.trim() || null,
          overall_assessment: overall,
          ...scores,
          overall_progress: clampPct(overallProgress),
          created_by: uid,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        setBusy(false);
        toast.error("保存失败：" + (error?.message ?? ""));
        return;
      }
      ratingId = inserted.id as string;
    }

    if (!ratingId) { setBusy(false); return; }
    const validItems = progressItems
      .map((p, i) => ({
        rating_id: ratingId,
        item_name: p.item_name.trim(),
        percentage: clampPct(p.percentage),
        sort_order: i,
        created_by: uid,
      }))
      .filter((p) => p.item_name.length > 0);
    if (validItems.length > 0) {
      await supabase.from("progress_items").insert(validItems);
    }
    setBusy(false);
    toast.success("已保存课堂评分");
    onSaved?.();
    onOpenChange(false);
  };

  const removeRating = async () => {
    if (!rating) return;
    if (!confirm("确认删除该评分？")) return;
    setBusy(true);
    const { error } = await supabase.from("ratings").delete().eq("id", rating.id);
    setBusy(false);
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除");
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rating ? (editable ? "编辑课堂评分" : "查看课堂评分") : "新增课堂评分"}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : !editable && !rating ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            该课次暂无评分
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {lessonDate}
            </div>
            <div className="space-y-2">
              <Label>本节课名称</Label>
              {editable ? (
                <Input
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  placeholder="如：分数加减法"
                />
              ) : (
                <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
                  {lessonName || <span className="text-muted-foreground">—</span>}
                </div>
              )}
            </div>

            <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-sm font-semibold text-foreground">学生表现</div>
              {dimensions.map((d) => (
                <div
                  key={d.key}
                  className="flex items-center justify-between rounded-lg bg-background/70 px-3 py-2"
                >
                  <span className="text-sm font-medium text-foreground">{d.label}</span>
                  <StarRating
                    value={scores[d.key]}
                    readOnly={!editable}
                    onChange={(v) => setScores((s) => ({ ...s, [d.key]: v }))}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                <span className="text-sm font-semibold text-foreground">整体表现评估</span>
                <StarRating value={overall} readOnly={!editable} onChange={setOverall} />
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">授课进度</div>
                {editable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setProgressItems((p) => [
                        ...p,
                        { item_name: "", percentage: 80, sort_order: p.length },
                      ])
                    }
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加知识点
                  </Button>
                )}
              </div>
              {progressItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  暂无知识点
                </div>
              )}
              {progressItems.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-background/70 px-2 py-2"
                >
                  {editable ? (
                    <Input
                      value={p.item_name}
                      onChange={(e) =>
                        setProgressItems((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, item_name: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="知识点名称"
                      className="h-8 flex-1"
                    />
                  ) : (
                    <span className="flex-1 truncate text-sm">{p.item_name}</span>
                  )}
                  <div className="flex items-center gap-1">
                    {editable ? (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={p.percentage}
                        onChange={(e) =>
                          setProgressItems((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? { ...x, percentage: clampPct(Number(e.target.value)) }
                                : x,
                            ),
                          )
                        }
                        className="h-8 w-16 text-right"
                      />
                    ) : (
                      <span className="text-sm">{p.percentage}</span>
                    )}
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setProgressItems((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                <span className="text-sm font-semibold text-foreground">整体吸收程度</span>
                <div className="flex items-center gap-1">
                  {editable ? (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={overallProgress}
                      onChange={(e) => setOverallProgress(clampPct(Number(e.target.value)))}
                      className="h-8 w-16 text-right"
                    />
                  ) : (
                    <span className="text-sm">{overallProgress}</span>
                  )}
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </section>

            <div className="space-y-2">
              <Label>课堂总结</Label>
              {editable && <MeetingNotesImport key={`${studentId}:${lessonDate}`} summary={summary} onImport={setSummary} disabled={busy || loading} />}
              {editable ? (
                <Textarea
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="本节课内容、亮点、需改进之处等"
                />
              ) : (
                <div className="whitespace-pre-wrap rounded-md bg-muted/30 px-3 py-2 text-sm min-h-[3rem]">
                  {summary || <span className="text-muted-foreground">—</span>}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between gap-2">
          {editable && rating ? (
            <Button
              variant="destructive"
              onClick={removeRating}
              disabled={busy}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              关闭
            </Button>
            {editable && (
              <Button onClick={save} disabled={busy || loading}>
                {busy ? "保存中..." : "保存"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
