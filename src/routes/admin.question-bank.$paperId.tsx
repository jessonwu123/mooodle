import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, BookOpen, ChevronDown, Sparkles, Check, X, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/math-text";
import {
  listTags,
  listQuestionTags,
  setQuestionTags,
  autoTagPaper,
} from "@/lib/math-tags.functions";
import { extractSolutionsForPaper } from "@/lib/math-solutions.functions";
import { renderPdfPages } from "@/lib/pdf-render";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/question-bank/$paperId")({
  component: PaperDetailPage,
});

type TagRow = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  description: string | null;
};

interface PaperRow {
  id: string;
  year: number;
  name: string;
  question_count: number;
}

interface QuestionRow {
  id: string;
  question_number: number;
  stem: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  correct_answer: string | null;
  image_path: string | null;
  options_image_path: string | null;
  stem_render_mode: "text" | "image";
  options_render_mode: "text" | "image";
  tags: string[];
  solution_md: string | null;
}

function PaperDetailPage() {
  const { paperId } = Route.useParams();
  const fetchTags = useServerFn(listTags);
  const fetchQuestionTags = useServerFn(listQuestionTags);
  const saveQuestionTags = useServerFn(setQuestionTags);
  const runAutoTag = useServerFn(autoTagPaper);
  const runExtractSolutions = useServerFn(extractSolutionsForPaper);

  const [paper, setPaper] = useState<PaperRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<TagRow[]>([]);
  const [questionTagMap, setQuestionTagMap] = useState<Record<string, string[]>>({});
  const [aiAssigned, setAiAssigned] = useState<Record<string, Set<string>>>({});
  const [autoTagging, setAutoTagging] = useState(false);
  const [extractingSolutions, setExtractingSolutions] = useState(false);
  const [extractStage, setExtractStage] = useState<string>("");
  const [solutionOpenFor, setSolutionOpenFor] = useState<QuestionRow | null>(null);

  const tagById = useMemo(() => {
    const m: Record<string, TagRow> = {};
    allTags.forEach((t) => (m[t.id] = t));
    return m;
  }, [allTags]);

  const loadQuestionTags = async (qIds: string[]) => {
    if (qIds.length === 0) return;
    const { links } = await fetchQuestionTags({ data: { questionIds: qIds } });
    const map: Record<string, string[]> = {};
    const ai: Record<string, Set<string>> = {};
    (links as Array<{ question_id: string; tag_id: string; assigned_by_ai: boolean }>).forEach(
      (l) => {
        (map[l.question_id] ??= []).push(l.tag_id);
        if (l.assigned_by_ai) (ai[l.question_id] ??= new Set()).add(l.tag_id);
      },
    );
    setQuestionTagMap(map);
    setAiAssigned(ai);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: qs }, tagsRes] = await Promise.all([
        supabase.from("math_papers").select("id, year, name, question_count").eq("id", paperId).single(),
        supabase
          .from("math_questions")
          .select(
            "id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, image_path, options_image_path, stem_render_mode, options_render_mode, tags, solution_md",
          )
          .eq("paper_id", paperId)
          .order("question_number"),
        fetchTags().catch(() => ({ tags: [] })),
      ]);
      if (!p) {
        toast.error("试卷不存在");
        setLoading(false);
        return;
      }
      setPaper(p as PaperRow);
      const list = (qs ?? []) as QuestionRow[];
      setQuestions(list);
      setAllTags(((tagsRes as { tags: TagRow[] }).tags ?? []) as TagRow[]);

      const paths = list
        .flatMap((q) => [q.image_path, q.options_image_path])
        .filter(Boolean) as string[];
      if (paths.length) {
        const { data: signed } = await supabase.storage
          .from("math-question-images")
          .createSignedUrls(paths, 3600);
        const map: Record<string, string> = {};
        signed?.forEach((s) => {
          if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
        });
        setImageUrls(map);
      }
      await loadQuestionTags(list.map((q) => q.id));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  const handleAutoTag = async () => {
    if (allTags.length === 0) {
      toast.error("请先到「分类题库」创建至少一个标签");
      return;
    }
    if (!confirm("使用 AI 自动给本卷所有题目打标签？将在已有标签基础上追加（已有的不会被删除）。")) return;
    setAutoTagging(true);
    try {
      const r = await runAutoTag({ data: { paperId, overwrite: false } });
      toast.success(`AI 完成：${r.totalQuestions} 题，新增 ${r.inserted} 条标签`);
      await loadQuestionTags(questions.map((q) => q.id));
    } catch (e: any) {
      toast.error(e?.message ?? "AI 打标签失败");
    } finally {
      setAutoTagging(false);
    }
  };

  const handleExtractSolutions = async () => {
    if (!paper) return;
    if (!paper.year) {
      toast.error("当前试卷未设置年份，无法自动匹配解析");
      return;
    }
    const confirmMsg = questions.some((q) => q.solution_md)
      ? "本卷已有部分题目存在解析，继续将用新提取的内容覆盖匹配到的题号。是否继续？"
      : `从「详细答案」文件夹中查找 ${paper.year} 年的解析 PDF，并用 AI 提取每道题的详细解答？`;
    if (!confirm(confirmMsg)) return;
    setExtractingSolutions(true);
    setExtractStage("查找解析 PDF...");
    try {
      // 在「详细答案」文件夹下找同年份的答案 PDF
      const { data: solutionPapers, error: spErr } = await supabase
        .from("math_papers")
        .select("id, name, pdf_path, folder:math_paper_folders!inner(name)")
        .eq("year", paper.year)
        .eq("folder.name", "详细答案")
        .limit(1);
      if (spErr) throw new Error(spErr.message);
      const solutionPaper = solutionPapers?.[0] as
        | { id: string; name: string; pdf_path: string }
        | undefined;
      if (!solutionPaper) throw new Error(`未在「详细答案」文件夹中找到 ${paper.year} 年的解析文件`);

      setExtractStage("下载解析 PDF...");
      const { data: signed, error: sErr } = await supabase.storage
        .from("math-papers")
        .createSignedUrl(solutionPaper.pdf_path, 3600);
      if (sErr || !signed?.signedUrl) throw new Error("生成解析 PDF 链接失败");
      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error("下载解析 PDF 失败");
      const blob = await res.blob();
      const file = new File([blob], "solution.pdf", { type: "application/pdf" });

      setExtractStage("渲染解析 PDF 页面...");
      const pages = await renderPdfPages(file, 1.4, 0.75);

      setExtractStage(`上传 ${pages.length} 页图片...`);
      const bucket = supabase.storage.from("math-papers");
      const prefix = `solutions/${paperId}/${Date.now()}`;
      const paths: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const path = `${prefix}/page-${String(i + 1).padStart(2, "0")}.jpg`;
        const { error } = await bucket.upload(path, pages[i].blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (error) throw new Error(`上传解析页面 ${i + 1} 失败：${error.message}`);
        paths.push(path);
      }
      const { data: urls, error: uErr } = await bucket.createSignedUrls(paths, 60 * 60);
      if (uErr) throw new Error("生成解析页面链接失败");
      const solutionPageImages = (urls ?? [])
        .map((x) => x.signedUrl)
        .filter(Boolean) as string[];
      if (solutionPageImages.length !== paths.length)
        throw new Error("解析页面链接不完整");

      setExtractStage("AI 提取解析中（可能需要 30 秒）...");
      const r = await runExtractSolutions({
        data: { paperId, solutionPageImages },
      });
      toast.success(`提取完成：${r.updated}/${r.totalQuestions} 题已写入解析`);

      // refresh solutions
      const { data: refreshed } = await supabase
        .from("math_questions")
        .select("id, solution_md")
        .eq("paper_id", paperId);
      if (refreshed) {
        const map = new Map<string, string | null>();
        (refreshed as Array<{ id: string; solution_md: string | null }>).forEach((r) =>
          map.set(r.id, r.solution_md),
        );
        setQuestions((prev) =>
          prev.map((q) => ({ ...q, solution_md: map.get(q.id) ?? q.solution_md })),
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "提取解析失败");
    } finally {
      setExtractingSolutions(false);
      setExtractStage("");
    }
  };

  const toggleTag = async (questionId: string, tagId: string) => {
    const current = questionTagMap[questionId] ?? [];
    const next = current.includes(tagId)
      ? current.filter((t) => t !== tagId)
      : [...current, tagId];
    setQuestionTagMap((m) => ({ ...m, [questionId]: next }));
    try {
      await saveQuestionTags({ data: { questionId, tagIds: next } });
    } catch (e: any) {
      toast.error(e?.message ?? "保存失败");
      setQuestionTagMap((m) => ({ ...m, [questionId]: current }));
    }
  };

  if (loading) {
    return <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">加载中...</div>;
  }
  if (!paper) return null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link to="/admin/question-bank">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            返回题库
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            {paper.year} 试卷详情
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{paper.name}</h1>
        </div>
        <Button
          onClick={handleExtractSolutions}
          disabled={extractingSolutions}
          className="gap-1.5"
          variant="outline"
        >
          {extractingSolutions ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {extractingSolutions ? extractStage || "提取中..." : "提取详细解析"}
        </Button>
        <Button
          onClick={handleAutoTag}
          disabled={autoTagging}
          className="gap-1.5"
          variant="outline"
        >
          <Sparkles className="h-4 w-4" />
          {autoTagging ? "AI 打标签中..." : "AI 自动打标签"}
        </Button>
      </div>
      <div className="space-y-3">
        {questions.map((q) => {
          const stemImg = q.image_path ? imageUrls[q.image_path] : null;
          const optionsImg = q.options_image_path ? imageUrls[q.options_image_path] : null;
          const stemAsImage = q.stem_render_mode === "image" && stemImg;
          const optionsAsImage = q.options_render_mode === "image" && optionsImg;
          return (
            <div key={q.id} className="rounded-lg border bg-card p-4 text-sm">
              <div className="font-medium">
                第 {q.question_number} 题
                {q.correct_answer && (
                  <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    答案 {q.correct_answer}
                  </span>
                )}
                {stemAsImage && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                    题干图片模式
                  </span>
                )}
                {optionsAsImage && (
                  <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                    选项图片模式
                  </span>
                )}
              </div>

              {stemAsImage ? (
                <div className="mt-2">
                  <img
                    src={stemImg}
                    alt={`第 ${q.question_number} 题题干`}
                    className="max-h-80 rounded border"
                  />
                  {q.stem && (
                    <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
                      <span className="shrink-0">文本备份：</span>
                      <MathText text={q.stem} className="flex-1" />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <MathText block text={q.stem} className="mt-1 whitespace-pre-wrap text-muted-foreground" />
                  {stemImg && (
                    <Collapsible className="mt-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 group">
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                          查看原题
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <img
                          src={stemImg}
                          alt={`第 ${q.question_number} 题原题`}
                          className="max-h-[600px] rounded border"
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </>
              )}

              {optionsAsImage ? (
                <div className="mt-3">
                  <img
                    src={optionsImg}
                    alt={`第 ${q.question_number} 题选项`}
                    className="max-h-64 rounded border"
                  />
                </div>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {(["a", "b", "c", "d", "e"] as const).map((k) => {
                      const v = q[`option_${k}` as const] as string | null;
                      if (!v) return null;
                      return (
                        <div key={k}>
                          <span className="font-semibold">{k.toUpperCase()}.</span>{" "}
                          <MathText text={v} />
                        </div>
                      );
                    })}

                  </div>
                  {optionsImg && (
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        选项截图（备份）
                      </div>
                      <img
                        src={optionsImg}
                        alt={`第 ${q.question_number} 题选项`}
                        className="max-h-56 rounded border"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Solution */}
              {q.solution_md && (
                <div className="mt-3 border-t pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSolutionOpenFor(q)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    查看详细解答
                  </Button>
                </div>
              )}

              {/* Tags */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  标签
                </span>
                {(questionTagMap[q.id] ?? []).map((tid) => {
                  const t = tagById[tid];
                  if (!t) return null;
                  const isAi = aiAssigned[q.id]?.has(tid);
                  return (
                    <span
                      key={tid}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                      style={t.color ? { borderColor: t.color, backgroundColor: t.color + "1a" } : undefined}
                      title={t.description ?? undefined}
                    >
                      {isAi && <Sparkles className="h-3 w-3 opacity-60" />}
                      {t.name}
                      <button
                        onClick={() => toggleTag(q.id, tid)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-background"
                        aria-label="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                      + 添加
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    {allTags.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">
                        还没有标签，先去「分类题库」创建。
                      </div>
                    ) : (
                      <div className="max-h-72 space-y-1 overflow-auto">
                        {allTags.map((t) => {
                          const checked = (questionTagMap[q.id] ?? []).includes(t.id);
                          return (
                            <button
                              key={t.id}
                              onClick={() => toggleTag(q.id, t.id)}
                              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
                            >
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: t.color ?? "#94a3b8" }}
                              />
                              <span className="text-[10px] uppercase text-muted-foreground">
                                {t.category}
                              </span>
                              <span className="flex-1">{t.name}</span>
                              {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!solutionOpenFor} onOpenChange={(o) => !o && setSolutionOpenFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              第 {solutionOpenFor?.question_number} 题 · 详细解答
              {solutionOpenFor?.correct_answer && (
                <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-normal text-green-700">
                  答案 {solutionOpenFor.correct_answer}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {solutionOpenFor?.solution_md && (
            <div className="text-sm leading-relaxed">
              <MathText block text={solutionOpenFor.solution_md} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
