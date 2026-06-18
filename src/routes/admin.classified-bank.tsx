import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, Plus, Tags, Trash2, Pencil, X, Settings2, Search, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/math-text";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listTags, createTag, updateTag, deleteTag, setQuestionTags, autoTagByTags } from "@/lib/math-tags.functions";

export const Route = createFileRoute("/admin/classified-bank")({
  component: ClassifiedBankPage,
  head: () => ({ meta: [{ title: "分类题库 · 后台" }] }),
});

type TagRow = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  description: string | null;
};

type QuestionRow = {
  id: string;
  paper_id: string;
  question_number: number;
  stem: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  correct_answer: string | null;
  stem_render_mode: "text" | "image";
  options_render_mode: "text" | "image";
};

type PaperRow = { id: string; year: number; name: string };

type DraftRow = { name: string; description: string };

function ClassifiedBankPage() {
  const fetchTags = useServerFn(listTags);
  const createTagFn = useServerFn(createTag);
  const updateTagFn = useServerFn(updateTag);
  const deleteTagFn = useServerFn(deleteTag);
  const setQuestionTagsFn = useServerFn(setQuestionTags);
  const autoTagByTagsFn = useServerFn(autoTagByTags);

  const [tags, setTags] = useState<TagRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [papers, setPapers] = useState<Record<string, PaperRow>>({});
  const [qTagMap, setQTagMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<"any" | "all">("any");
  const [showUntagged, setShowUntagged] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  // Manage dialog
  const [manageOpen, setManageOpen] = useState(false);

  // Create (batch) dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([{ name: "", description: "" }]);
  const [saving, setSaving] = useState(false);

  // Edit (single) dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  // Per-question tag popover
  const [openTagPopoverFor, setOpenTagPopoverFor] = useState<string | null>(null);
  const [popoverSearch, setPopoverSearch] = useState("");
  const [savingTagsFor, setSavingTagsFor] = useState<string | null>(null);

  // AI update dialog
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTagIds, setAiTagIds] = useState<Set<string>>(new Set());
  const [aiScope, setAiScope] = useState<"all" | "missing">("missing");
  const [aiSearch, setAiSearch] = useState("");
  const [aiRunning, setAiRunning] = useState(false);

  const refreshTags = async () => {
    const r = await fetchTags();
    setTags(r.tags as TagRow[]);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tagsRes, qRes, pRes, linksRes] = await Promise.all([
        fetchTags(),
        supabase
          .from("math_questions")
          .select(
            "id, paper_id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, stem_render_mode, options_render_mode",
          )
          .order("question_number"),
        supabase.from("math_papers").select("id, year, name"),
        supabase.from("math_question_tags").select("question_id, tag_id"),
      ]);
      setTags((tagsRes.tags ?? []) as TagRow[]);
      const qs = (qRes.data ?? []) as QuestionRow[];
      setQuestions(qs);
      const pmap: Record<string, PaperRow> = {};
      (pRes.data ?? []).forEach((p: any) => (pmap[p.id] = p));
      setPapers(pmap);
      const map: Record<string, string[]> = {};
      (linksRes.data ?? []).forEach((l: any) => {
        (map[l.question_id] ??= []).push(l.tag_id);
      });
      setQTagMap(map);
    } catch (e: any) {
      toast.error(e?.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadAll();
  }, []);

  const tagById = useMemo(() => {
    const m: Record<string, TagRow> = {};
    tags.forEach((t) => (m[t.id] = t));
    return m;
  }, [tags]);

  // Stats: count questions per tag
  const tagCounts = useMemo(() => {
    const c: Record<string, number> = {};
    Object.values(qTagMap).forEach((tids) => {
      tids.forEach((tid) => {
        c[tid] = (c[tid] ?? 0) + 1;
      });
    });
    return c;
  }, [qTagMap]);

  const untaggedCount = useMemo(
    () => questions.filter((q) => !qTagMap[q.id] || qTagMap[q.id].length === 0).length,
    [questions, qTagMap],
  );

  const filteredQuestions = useMemo(() => {
    if (showUntagged) {
      return questions.filter((q) => !qTagMap[q.id] || qTagMap[q.id].length === 0);
    }
    if (selectedTags.size === 0) return questions;
    return questions.filter((q) => {
      const tids = qTagMap[q.id] ?? [];
      if (filterMode === "any") return tids.some((t) => selectedTags.has(t));
      return Array.from(selectedTags).every((t) => tids.includes(t));
    });
  }, [questions, qTagMap, selectedTags, filterMode, showUntagged]);

  const filteredTags = useMemo(() => {
    const kw = tagSearch.trim().toLowerCase();
    if (!kw) return tags;
    return tags.filter(
      (t) =>
        t.name.toLowerCase().includes(kw) ||
        (t.description ?? "").toLowerCase().includes(kw),
    );
  }, [tags, tagSearch]);

  const toggleSelectTag = (id: string) => {
    setShowUntagged(false);
    setSelectedTags((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const clearFilter = () => {
    setSelectedTags(new Set());
    setShowUntagged(false);
  };

  // Tag CRUD handlers
  const openCreate = () => {
    setDrafts([{ name: "", description: "" }]);
    setCreateOpen(true);
  };
  const openEdit = (t: TagRow) => {
    setEditing(t);
    setEditForm({ name: t.name, description: t.description ?? "" });
    setEditOpen(true);
  };
  const updateDraft = (idx: number, patch: Partial<DraftRow>) =>
    setDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addDraft = () => setDrafts((rows) => [...rows, { name: "", description: "" }]);
  const removeDraft = (idx: number) =>
    setDrafts((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== idx)));

  const handleCreateBatch = async () => {
    const valid = drafts
      .map((d) => ({ name: d.name.trim(), description: d.description.trim() }))
      .filter((d) => d.name.length > 0);
    if (valid.length === 0) {
      toast.error("请至少输入一个知识点名称");
      return;
    }
    setSaving(true);
    let ok = 0;
    let fail = 0;
    for (const d of valid) {
      try {
        await createTagFn({
          data: { name: d.name, category: "knowledge", color: null, description: d.description || null },
        });
        ok++;
      } catch (e: any) {
        fail++;
        toast.error(`「${d.name}」创建失败：${e?.message ?? "未知错误"}`);
      }
    }
    setSaving(false);
    if (ok > 0) toast.success(`已创建 ${ok} 个知识点${fail ? `，失败 ${fail} 个` : ""}`);
    if (fail === 0) setCreateOpen(false);
    await refreshTags();
  };

  const handleEditSave = async () => {
    if (!editing) return;
    if (!editForm.name.trim()) {
      toast.error("请输入名称");
      return;
    }
    try {
      await updateTagFn({
        data: {
          id: editing.id,
          name: editForm.name.trim(),
          category: editing.category,
          color: editing.color,
          description: editForm.description.trim() || null,
        },
      });
      toast.success("已更新");
      setEditOpen(false);
      await refreshTags();
    } catch (e: any) {
      toast.error(e?.message ?? "保存失败");
    }
  };

  const handleDelete = async (t: TagRow) => {
    if (!confirm(`确定删除「${t.name}」？所有题目上的该标签也会被移除。`)) return;
    try {
      await deleteTagFn({ data: { id: t.id } });
      toast.success("已删除");
      await refreshTags();
      // also refresh links/count since deletion cascades
      const { data: linksRes } = await supabase
        .from("math_question_tags")
        .select("question_id, tag_id");
      const map: Record<string, string[]> = {};
      (linksRes ?? []).forEach((l: any) => {
        (map[l.question_id] ??= []).push(l.tag_id);
      });
      setQTagMap(map);
    } catch (e: any) {
      toast.error(e?.message ?? "删除失败");
    }
  };

  const toggleQuestionTag = async (questionId: string, tagId: string) => {
    const current = qTagMap[questionId] ?? [];
    const next = current.includes(tagId)
      ? current.filter((t) => t !== tagId)
      : [...current, tagId];
    // optimistic update
    setQTagMap((m) => ({ ...m, [questionId]: next }));
    setSavingTagsFor(questionId);
    try {
      await setQuestionTagsFn({ data: { questionId, tagIds: next } });
    } catch (e: any) {
      toast.error(e?.message ?? "保存失败");
      setQTagMap((m) => ({ ...m, [questionId]: current }));
    } finally {
      setSavingTagsFor(null);
    }
  };

  const removeQuestionTag = async (questionId: string, tagId: string) => {
    const current = qTagMap[questionId] ?? [];
    const next = current.filter((t) => t !== tagId);
    setQTagMap((m) => ({ ...m, [questionId]: next }));
    try {
      await setQuestionTagsFn({ data: { questionId, tagIds: next } });
    } catch (e: any) {
      toast.error(e?.message ?? "移除失败");
      setQTagMap((m) => ({ ...m, [questionId]: current }));
    }
  };

  const openAi = () => {
    setAiTagIds(new Set(selectedTags));
    setAiSearch("");
    setAiScope("missing");
    setAiOpen(true);
  };

  const runAiUpdate = async () => {
    if (aiTagIds.size === 0) {
      toast.error("请至少选择一个标签");
      return;
    }
    setAiRunning(true);
    try {
      const res = await autoTagByTagsFn({
        data: { tagIds: Array.from(aiTagIds), scope: aiScope },
      });
      toast.success(
        `AI 扫描完成：共扫描 ${res.scanned ?? res.totalQuestions} 题，新增 ${res.inserted} 条标签`,
      );
      setAiOpen(false);
      // refresh links
      const { data: linksRes } = await supabase
        .from("math_question_tags")
        .select("question_id, tag_id");
      const map: Record<string, string[]> = {};
      (linksRes ?? []).forEach((l: any) => {
        (map[l.question_id] ??= []).push(l.tag_id);
      });
      setQTagMap(map);
    } catch (e: any) {
      toast.error(e?.message ?? "AI 打标签失败");
    } finally {
      setAiRunning(false);
    }
  };


  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            分类题库
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">按知识点浏览题目</h1>
        </div>
        <Button variant="outline" onClick={openAi} className="gap-1.5">
          <Sparkles className="h-4 w-4" />
          AI 更新标签
        </Button>
        <Button variant="outline" onClick={() => setManageOpen(true)} className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          管理知识点
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Sidebar: tags */}
        <Card className="p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden flex flex-col">
          <div className="mb-3 flex items-center gap-2">
            <Tags className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">知识点</h2>
            <span className="text-xs text-muted-foreground">{tags.length}</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant={filterMode === "any" ? "default" : "outline"}
                className="h-6 px-2 text-[11px]"
                onClick={() => setFilterMode("any")}
                title="任一标签匹配"
              >
                任一
              </Button>
              <Button
                size="sm"
                variant={filterMode === "all" ? "default" : "outline"}
                className="h-6 px-2 text-[11px]"
                onClick={() => setFilterMode("all")}
                title="同时具备所有标签"
              >
                全部
              </Button>
            </div>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="搜索知识点..."
              className="h-8 pl-7 text-sm"
            />
          </div>
          <div className="mb-2 flex items-center gap-2 text-xs">
            <button
              onClick={clearFilter}
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              清空筛选
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => {
                setSelectedTags(new Set());
                setShowUntagged((v) => !v);
              }}
              className={`underline-offset-2 hover:underline ${showUntagged ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              仅看未打标签 ({untaggedCount})
            </button>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto pr-1">
            {filteredTags.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                {tags.length === 0 ? "还没有知识点，点击右上角「管理知识点」添加。" : "没有匹配的知识点"}
              </div>
            ) : (
              filteredTags.map((t) => {
                const checked = selectedTags.has(t.id);
                const count = tagCounts[t.id] ?? 0;
                return (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted ${checked ? "bg-muted" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelectTag(t.id)}
                    />
                    <span className="flex-1 truncate" title={t.description ?? undefined}>
                      {t.name}
                    </span>
                    <Badge
                      variant={count > 0 ? "secondary" : "outline"}
                      className="h-5 min-w-[2rem] justify-center px-1.5 text-[10px]"
                    >
                      {count}
                    </Badge>
                  </label>
                );
              })
            )}
          </div>
        </Card>

        {/* Main: questions */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              共 <span className="font-semibold text-foreground">{filteredQuestions.length}</span> 题
              {questions.length > 0 && (
                <span className="text-muted-foreground"> / {questions.length}</span>
              )}
            </span>
            {showUntagged && (
              <Badge variant="outline" className="gap-1">
                未打标签
                <button onClick={() => setShowUntagged(false)} aria-label="移除">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {Array.from(selectedTags).map((tid) => {
              const t = tagById[tid];
              if (!t) return null;
              return (
                <Badge key={tid} variant="secondary" className="gap-1">
                  {t.name}
                  <button onClick={() => toggleSelectTag(tid)} aria-label="移除">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>

          {loading ? (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              加载中...
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
              没有匹配的题目
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((q) => {
                const paper = papers[q.paper_id];
                const tids = qTagMap[q.id] ?? [];
                return (
                  <div key={q.id} className="rounded-lg border bg-card p-4 text-sm">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {paper && (
                        <Link
                          to="/admin/question-bank/$paperId"
                          params={{ paperId: paper.id }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {paper.name}
                        </Link>
                      )}
                      <span>·</span>
                      <span>第 {q.question_number} 题</span>
                      {q.correct_answer && (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-700">
                          答案 {q.correct_answer}
                        </span>
                      )}
                      {q.stem_render_mode === "image" && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                          题干图片模式
                        </span>
                      )}
                    </div>
                    <MathText
                      block
                      text={q.stem}
                      className="whitespace-pre-wrap text-foreground"
                    />
                    {q.options_render_mode !== "image" && (
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        {(["a", "b", "c", "d", "e"] as const).map((k) => {
                          const v = q[`option_${k}` as const];
                          if (!v) return null;
                          return (
                            <div key={k}>
                              <span className="font-semibold">{k.toUpperCase()}.</span>{" "}
                              <MathText text={v} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2">
                      {tids.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">未打标签</span>
                      ) : (
                        tids.map((tid) => {
                          const t = tagById[tid];
                          if (!t) return null;
                          return (
                            <span
                              key={tid}
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                              style={
                                t.color
                                  ? { borderColor: t.color, backgroundColor: t.color + "1a" }
                                  : undefined
                              }
                              title={t.description ?? undefined}
                            >
                              {t.name}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manage tags dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              知识点管理
            </DialogTitle>
          </DialogHeader>
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>共 {tags.length} 个知识点</span>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              新建知识点
            </Button>
          </div>
          {tags.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              还没有知识点。
            </div>
          ) : (
            <div className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
              {tags.map((t) => (
                <div key={t.id} className="flex items-start gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {t.name}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {tagCounts[t.id] ?? 0} 题
                      </span>
                    </div>
                    {t.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">
                        {t.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => openEdit(t)}
                    className="rounded p-1.5 hover:bg-muted"
                    aria-label="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="rounded p-1.5 text-destructive hover:bg-muted"
                    aria-label="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Batch create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建知识点</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {drafts.map((d, idx) => (
              <div key={idx} className="rounded-md border p-3 space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                  {drafts.length > 1 && (
                    <button
                      onClick={() => removeDraft(idx)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="移除"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>名称</Label>
                  <Input
                    value={d.name}
                    onChange={(e) => updateDraft(idx, { name: e.target.value })}
                    placeholder="如：勾股定理"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>说明</Label>
                  <Textarea
                    rows={2}
                    value={d.description}
                    onChange={(e) => updateDraft(idx, { description: e.target.value })}
                    placeholder="会作为提示给 AI，描述越清晰打标越准"
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addDraft} className="gap-1.5">
              <Plus className="h-4 w-4" />
              再加一个
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleCreateBatch} disabled={saving}>
              {saving ? "保存中..." : "全部保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑知识点</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>说明</Label>
              <Textarea
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="会作为提示给 AI"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
