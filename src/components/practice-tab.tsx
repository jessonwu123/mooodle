import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, BookOpen, Target, CheckCircle2, XCircle, Lock, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MathText } from "@/components/math-text";
import {
  listPracticePapers,
  listPracticeTags,
  loadPaperQuestions,
  loadTargetedQuestions,
  loadAiQuestions,
  submitPracticeAttempts,
  getPracticeStats,
} from "@/lib/practice.functions";

type Q = {
  id: string;
  question_number: number;
  paper_id: string;
  stem: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  answer_type: string | null;
  stem_render_mode: string | null;
  options_render_mode: string | null;
  image_url: string | null;
  options_image_url: string | null;
  paper_name?: string | null;
  year?: number | null;
};

type Graded = { question_id: string; answer: string; is_correct: boolean; correct_answer: string };

const LETTERS = ["A", "B", "C", "D", "E"] as const;

function QuestionCard({
  q,
  index,
  selected,
  onSelect,
  graded,
  locked,
}: {
  q: Q;
  index: number;
  selected: string | null;
  onSelect: (v: string) => void;
  graded?: Graded;
  locked: boolean;
}) {
  const options: Array<{ letter: string; text: string | null }> = [
    { letter: "A", text: q.option_a },
    { letter: "B", text: q.option_b },
    { letter: "C", text: q.option_c },
    { letter: "D", text: q.option_d },
    { letter: "E", text: q.option_e },
  ].filter((o) => o.text !== null && o.text !== undefined);

  const stemImg = q.stem_render_mode === "image" && q.image_url;
  const optsImg = q.options_render_mode === "image" && q.options_image_url;

  const [showOriginal, setShowOriginal] = useState(false);
  const originalUrl = q.image_url || q.options_image_url || null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">
          第 {index + 1} 题
        </span>
        {q.year != null && <span className="text-xs">{q.year}</span>}
        {originalUrl && (
          <button
            type="button"
            onClick={() => setShowOriginal(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
          >
            <ImageIcon className="h-3 w-3" />查看原题
          </button>
        )}
        {graded &&
          (graded.is_correct ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />答对
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
              <XCircle className="h-3.5 w-3.5" />答错（正确答案 {graded.correct_answer || "?"}）
            </span>
          ))}
      </div>

      <Dialog open={showOriginal} onOpenChange={setShowOriginal}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>第 {index + 1} 题 · 原题截图</DialogTitle>
          </DialogHeader>
          {originalUrl && <img src={originalUrl} alt="原题" className="w-full rounded-md border" />}
        </DialogContent>
      </Dialog>

      <div className="mb-3">
        {stemImg ? (
          <img src={q.image_url!} alt="题干" className="max-h-80 rounded-lg border" />
        ) : (
          <MathText text={q.stem ?? ""} className="text-foreground" />
        )}
      </div>

      {optsImg ? (
        <div className="mb-3">
          <img src={q.options_image_url!} alt="选项" className="max-h-60 rounded-lg border" />
          <div className="mt-2 grid grid-cols-5 gap-2">
            {LETTERS.map((l) => {
              const isSel = selected === l;
              const correct = graded?.correct_answer === l;
              const wrongPick = graded && !graded.is_correct && graded.answer === l;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={locked}
                  onClick={() => onSelect(l)}
                  className={[
                    "rounded-lg border py-2 text-sm font-semibold transition-colors",
                    isSel ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
                    graded && correct ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "",
                    wrongPick ? "border-rose-500 bg-rose-50 text-rose-700" : "",
                  ].join(" ")}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((o) => {
            const isSel = selected === o.letter;
            const correct = graded?.correct_answer === o.letter;
            const wrongPick = graded && !graded.is_correct && graded.answer === o.letter;
            return (
              <button
                key={o.letter}
                type="button"
                disabled={locked}
                onClick={() => onSelect(o.letter)}
                className={[
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  isSel ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                  graded && correct ? "border-emerald-500 bg-emerald-50" : "",
                  wrongPick ? "border-rose-500 bg-rose-50" : "",
                ].join(" ")}
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                  {o.letter}
                </span>
                <MathText text={o.text ?? ""} className="text-sm text-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PracticeRunner({
  studentId,
  mode,
  paperId,
  tagIds,
  questions,
  onExit,
}: {
  studentId: string;
  mode: "paper" | "targeted" | "ai";
  paperId?: string | null;
  tagIds?: string[];
  questions: Q[];
  onExit: () => void;
}) {
  const submitFn = useServerFn(submitPracticeAttempts);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [graded, setGraded] = useState<Graded[] | null>(null);
  const [score, setScore] = useState<{ total: number; correct: number; score: number } | null>(null);

  const gradedMap = useMemo(() => {
    if (!graded) return new Map<string, Graded>();
    return new Map(graded.map((g) => [g.question_id, g]));
  }, [graded]);

  const handleSubmit = async () => {
    const incomplete = questions.filter((q) => !answers[q.id]);
    if (incomplete.length > 0) {
      const ok = window.confirm(`还有 ${incomplete.length} 题未作答，确认提交吗？`);
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const res = await submitFn({
        data: {
          studentId,
          mode,
          paperId: paperId ?? null,
          tagIds: tagIds ?? [],
          answers: questions.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? null })),
        },
      });
      setGraded(res.graded);
      setScore({ total: res.total, correct: res.correct, score: res.score });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← 返回选择
        </Button>
        {score ? (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">本次成绩</div>
            <div className="text-2xl font-bold text-primary">
              {score.correct}/{score.total}
              <span className="ml-2 text-sm font-medium text-muted-foreground">({score.score} 分)</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            已作答 {Object.keys(answers).length}/{questions.length}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            selected={answers[q.id] ?? null}
            onSelect={(v) => setAnswers((p) => ({ ...p, [q.id]: v }))}
            graded={gradedMap.get(q.id)}
            locked={!!graded}
          />
        ))}
      </div>

      <div className="flex justify-end gap-2">
        {graded ? (
          <Button onClick={onExit}>完成</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            提交批改
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- panels ----------

function PaperPanel({ studentId, onStart }: { studentId: string; onStart: (questions: Q[], paperId: string) => void }) {
  const listFn = useServerFn(listPracticePapers);
  const loadFn = useServerFn(loadPaperQuestions);
  const [loading, setLoading] = useState(true);
  const [papers, setPapers] = useState<any[]>([]);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listFn({ data: { studentId } });
        setPapers(res.papers);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId, listFn]);

  if (loading) return <div className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
  if (papers.length === 0) return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">暂无可练习的真题卷</div>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {papers.map((p) => (
        <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-foreground">{p.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {p.year ?? "—"} · {p.question_count ?? 0} 题
              </div>
            </div>
            <Button
              size="sm"
              disabled={busyId === p.id}
              onClick={async () => {
                setBusyId(p.id);
                try {
                  const res = await loadFn({ data: { studentId, paperId: p.id } });
                  if (res.questions.length === 0) {
                    toast.error("此卷暂无可练习的题目");
                    return;
                  }
                  onStart(res.questions, p.id);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "加载失败");
                } finally {
                  setBusyId("");
                }
              }}
            >
              {busyId === p.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              开始练习
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TargetedPanel({ studentId, onStart }: { studentId: string; onStart: (questions: Q[], tagIds: string[]) => void }) {
  const listFn = useServerFn(listPracticeTags);
  const loadFn = useServerFn(loadTargetedQuestions);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Array<{ id: string; name: string; category: string; count: number }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listFn({ data: { studentId } });
        setTags(res.tags);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId, listFn]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof tags>();
    for (const t of tags) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return Array.from(map.entries());
  }, [tags]);

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (loading) return <div className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold text-foreground">选择知识点 tag</div>
        {grouped.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无 tag</div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([cat, ts]) => (
              <div key={cat}>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {ts.map((t) => {
                    const isSel = selected.has(t.id);
                    const disabled = t.count === 0;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(t.id)}
                        className={[
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          isSel ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
                          disabled ? "cursor-not-allowed opacity-40" : "",
                        ].join(" ")}
                      >
                        <Checkbox checked={isSel} className="pointer-events-none h-3.5 w-3.5" />
                        {t.name}
                        <span className="text-[10px] text-muted-foreground">({t.count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold text-foreground">题目数量</div>
        <div className="flex flex-wrap items-center gap-2">
          {[5, 10, 20, 30].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              className={[
                "rounded-lg border px-3 py-1.5 text-sm",
                limit === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
              ].join(" ")}
            >
              {n} 题
            </button>
          ))}
        </div>
      </div>

      <Button
        disabled={busy || selected.size === 0}
        onClick={async () => {
          setBusy(true);
          try {
            const ids = Array.from(selected);
            const res = await loadFn({ data: { studentId, tagIds: ids, limit } });
            if (res.questions.length === 0) {
              toast.error("没有匹配的题目");
              return;
            }
            onStart(res.questions, ids);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "加载失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        开始针对性练习（已选 {selected.size} 个 tag）
      </Button>
    </div>
  );
}

function AiPanel({
  studentId,
  stats,
  onStart,
}: {
  studentId: string;
  stats: { doneCount: number; aiUnlocked: boolean; aiThreshold: number };
  onStart: (questions: Q[]) => void;
}) {
  const loadFn = useServerFn(loadAiQuestions);
  const [busy, setBusy] = useState(false);

  const pct = Math.min(100, Math.round((stats.doneCount / stats.aiThreshold) * 100));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="text-base font-semibold text-foreground">AI 智能刷题</div>
        </div>
        <p className="text-sm text-muted-foreground">
          系统会根据你的错题 tag 分布分析薄弱项，针对性抽取 10 道题进行练习。
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">解锁进度</span>
            <span className="font-semibold text-foreground">
              {stats.doneCount} / {stats.aiThreshold}
            </span>
          </div>
          <Progress value={pct} />
        </div>
      </div>

      {stats.aiUnlocked ? (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await loadFn({ data: { studentId, limit: 10 } });
              if (res.questions.length === 0) {
                toast.error("无法生成练习题");
                return;
              }
              onStart(res.questions);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "加载失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          开始 AI 刷题（10 题）
        </Button>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          再完成 {stats.aiThreshold - stats.doneCount} 道题即可解锁
        </div>
      )}
    </div>
  );
}

// ---------- main ----------

export function PracticeTab({ studentId }: { studentId: string }) {
  const statsFn = useServerFn(getPracticeStats);
  const [stats, setStats] = useState<{ doneCount: number; totalWrong: number; aiUnlocked: boolean; aiThreshold: number } | null>(null);
  const [active, setActive] = useState<
    | { kind: "menu" }
    | { kind: "run"; mode: "paper" | "targeted" | "ai"; paperId?: string | null; tagIds?: string[]; questions: Q[] }
  >({ kind: "menu" });

  const refreshStats = useCallback(async () => {
    try {
      const s = await statsFn({ data: { studentId } });
      setStats(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    }
  }, [studentId, statsFn]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  if (active.kind === "run") {
    return (
      <PracticeRunner
        studentId={studentId}
        mode={active.mode}
        paperId={active.paperId}
        tagIds={active.tagIds}
        questions={active.questions}
        onExit={() => {
          setActive({ kind: "menu" });
          refreshStats();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">已刷题数</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{stats.doneCount}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">累计错题次数</div>
            <div className="mt-1 text-2xl font-bold text-rose-600">{stats.totalWrong}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">AI 刷题</div>
            <div className="mt-1 text-sm font-semibold">
              {stats.aiUnlocked ? <span className="text-emerald-600">已解锁</span> : `还差 ${stats.aiThreshold - stats.doneCount} 题`}
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="paper" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="paper">
            <BookOpen className="mr-1.5 h-4 w-4" />历年真题
          </TabsTrigger>
          <TabsTrigger value="targeted">
            <Target className="mr-1.5 h-4 w-4" />针对性练习
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="mr-1.5 h-4 w-4" />AI 刷题
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paper" className="mt-4">
          <PaperPanel
            studentId={studentId}
            onStart={(questions, paperId) => setActive({ kind: "run", mode: "paper", paperId, questions })}
          />
        </TabsContent>
        <TabsContent value="targeted" className="mt-4">
          <TargetedPanel
            studentId={studentId}
            onStart={(questions, tagIds) => setActive({ kind: "run", mode: "targeted", tagIds, questions })}
          />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          {stats && (
            <AiPanel
              studentId={studentId}
              stats={stats}
              onStart={(questions) => setActive({ kind: "run", mode: "ai", questions })}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
