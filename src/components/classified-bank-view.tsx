import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, Plus, Tags, Trash2, Pencil, X, Settings2, Search, Sparkles, Loader2, Image as ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listTags, createTag, updateTag, deleteTag, setQuestionTags, autoTagByTags } from "@/lib/math-tags.functions";
import { updateCalcQuestion, deleteCalcQuestion } from "@/lib/math-papers.functions";
import { CalcImportDialog } from "@/components/calc-import-dialog";
import { EditableQuestionImage } from "@/components/editable-question-image";


type TagRow = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  description: string | null;
  parent_id: string | null;
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
  image_path: string | null;
  options_image_path: string | null;
};

type PaperRow = { id: string; year: number; name: string };

type DraftRow = { name: string; description: string; parentId: string | null };

export function ClassifiedBankView({ variant }: { variant: "exam" | "calc" }) {
  const isCalc = variant === "calc";
  const tagCategoryOk = (c: string) => (isCalc ? c === "calc" : true);
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
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [tagSearch, setTagSearch] = useState("");

  // Manage dialog
  const [manageOpen, setManageOpen] = useState(false);

  // Create (batch) dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([{ name: "", description: "", parentId: null }]);
  const [saving, setSaving] = useState(false);

  // Edit (single) dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", parentId: null as string | null });

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

  // 修改 / 删除单题
  const updateQuestionFn = useServerFn(updateCalcQuestion);
  const deleteQuestionFn = useServerFn(deleteCalcQuestion);
  const [editQOpen, setEditQOpen] = useState(false);
  const [editQ, setEditQ] = useState<QuestionRow | null>(null);
  const [editStem, setEditStem] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [savingQ, setSavingQ] = useState(false);
  const [deletingQ, setDeletingQ] = useState<string | null>(null);

  const openEditQuestion = (q: QuestionRow) => {
    setEditQ(q);
    setEditStem(q.stem);
    setEditAnswer(q.correct_answer ?? "");
    setEditQOpen(true);
  };

  const handleSaveQuestion = async () => {
    if (!editQ) return;
    if (!editStem.trim()) {
      toast.error("题干不能为空");
      return;
    }
    setSavingQ(true);
    try {
      await updateQuestionFn({
        data: { questionId: editQ.id, stem: editStem.trim(), answer: editAnswer.trim() || null },
      });
      toast.success("已保存");
      setEditQOpen(false);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "保存失败");
    } finally {
      setSavingQ(false);
    }
  };

  const handleDeleteQuestion = async (q: QuestionRow) => {
    if (!window.confirm("确定删除这道题吗？删除后不可恢复。")) return;
    setDeletingQ(q.id);
    try {
      await deleteQuestionFn({ data: { questionId: q.id } });
      toast.success("已删除");
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
    } catch (e: any) {
      toast.error(e?.message ?? "删除失败");
    } finally {
      setDeletingQ(null);
    }
  };

  const refreshTags = async () => {
    const r = await fetchTags();
    setTags((r.tags as TagRow[]).filter((t) => tagCategoryOk(t.category)));
  };

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [originalDialog, setOriginalDialog] = useState<{
    open: boolean;
    title: string;
    questionId: string | null;
    stemPath: string | null;
    optionsPath: string | null;
    stemUrl: string | null;
    optionsUrl: string | null;
  }>({ open: false, title: "", questionId: null, stemPath: null, optionsPath: null, stemUrl: null, optionsUrl: null });

  // Supabase caps each query at 1000 rows; page through all tag links.
  const fetchAllLinks = async () => {
    const all: any[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("math_question_tags")
        .select("question_id, tag_id")
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return { data: all };
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tagsRes, qRes, pRes, linksRes] = await Promise.all([
        fetchTags(),
        (async () => {
          const all: any[] = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase
              .from("math_questions")
              .select(
                "id, paper_id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, stem_render_mode, options_render_mode, image_path, options_image_path, answer_type",
              )
              .order("question_number")
              .order("id")
              .range(from, from + 999);
            if (error) throw error;
            all.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          return { data: all };
        })(),
        supabase.from("math_papers").select("id, year, name"),
        fetchAllLinks(),
      ]);
      setTags(((tagsRes.tags ?? []) as TagRow[]).filter((t) => tagCategoryOk(t.category)));
      const calcTagIds = new Set(
        ((tagsRes.tags ?? []) as TagRow[]).filter((t) => t.category === "calc").map((t) => t.id),
      );
      const calcLinked = new Set(
        (linksRes.data ?? []).filter((l: any) => calcTagIds.has(l.tag_id)).map((l: any) => l.question_id),
      );
      const qs = ((qRes.data ?? []) as any[]).filter(
        (q) => !isCalc || q.answer_type === "计算" || calcLinked.has(q.id),
      ) as QuestionRow[];
      setQuestions(qs);
      const pmap: Record<string, PaperRow> = {};
      (pRes.data ?? []).forEach((p: any) => (pmap[p.id] = p));
      setPapers(pmap);
      const map: Record<string, string[]> = {};
      (linksRes.data ?? []).forEach((l: any) => {
        (map[l.question_id] ??= []).push(l.tag_id);
      });
      setQTagMap(map);

      // Sign URLs for original images
      const paths = Array.from(
        new Set(
          qs
            .flatMap((q) => [q.image_path, q.options_image_path])
            .filter(Boolean) as string[],
        ),
      );
      if (paths.length) {
        const urlMap: Record<string, string> = {};
        // chunk to avoid request size limits
        const CHUNK = 100;
        for (let i = 0; i < paths.length; i += CHUNK) {
          const slice = paths.slice(i, i + CHUNK);
          const { data: signed } = await supabase.storage
            .from("math-question-images")
            .createSignedUrls(slice, 3600);
          signed?.forEach((s) => {
            if (s.path && s.signedUrl) urlMap[s.path] = s.signedUrl;
          });
        }
        setImageUrls(urlMap);
      }
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
  const rootTags = useMemo(() => tags.filter((t) => !t.parent_id), [tags]);
  const childTags = (parentId: string) => tags.filter((t) => t.parent_id === parentId);

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
      if (filterMode === "any") return Array.from(selectedTags).some((id) => tids.includes(id));
      return Array.from(selectedTags).every((id) => tids.includes(id));
    });
  }, [questions, qTagMap, selectedTags, filterMode, showUntagged, tags]);

  const tagGroups = useMemo(() => {
    const kw = tagSearch.trim().toLowerCase();
    const matches = (tag: TagRow) =>
      !kw ||
      tag.name.toLowerCase().includes(kw) ||
      (tag.description ?? "").toLowerCase().includes(kw);
    const tagIds = new Set(tags.map((tag) => tag.id));
    const roots = tags.filter((tag) => !tag.parent_id || !tagIds.has(tag.parent_id));

    return roots
      .map((parent) => {
        const children = tags.filter((tag) => tag.parent_id === parent.id);
        const parentMatches = matches(parent);
        const visibleChildren = parentMatches ? children : children.filter(matches);
        return { parent, children: visibleChildren, visible: parentMatches || visibleChildren.length > 0 };
      })
      .filter((group) => group.visible);
  }, [tags, tagSearch]);

  const toggleSelectTag = (id: string) => {
    setShowUntagged(false);
    setSelectedTags((prev) => {
      const n = new Set(prev);
      const childIds = childTags(id).map((t) => t.id);
      if (n.has(id)) {
        // 取消一级标签时，同时取消其所有二级标签
        n.delete(id);
        childIds.forEach((cid) => n.delete(cid));
      } else {
        // 选中一级标签时，默认同时选中其所有二级标签
        n.add(id);
        childIds.forEach((cid) => n.add(cid));
      }
      return n;
    });
  };

  const clearFilter = () => {
    setSelectedTags(new Set());
    setShowUntagged(false);
  };

  // Tag CRUD handlers
  const openCreate = () => {
    setDrafts([{ name: "", description: "", parentId: null }]);
    setCreateOpen(true);
  };
  const openEdit = (t: TagRow) => {
    setEditing(t);
    setEditForm({ name: t.name, description: t.description ?? "", parentId: t.parent_id });
    setEditOpen(true);
  };
  const updateDraft = (idx: number, patch: Partial<DraftRow>) =>
    setDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addDraft = () => setDrafts((rows) => [...rows, { name: "", description: "", parentId: null }]);
  const removeDraft = (idx: number) =>
    setDrafts((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== idx)));

  const handleCreateBatch = async () => {
    const valid = drafts
      .map((d) => ({ name: d.name.trim(), description: d.description.trim(), parentId: d.parentId }))
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
          data: { name: d.name, category: isCalc ? "calc" : "knowledge", color: null, description: d.description || null, parentId: isCalc ? d.parentId : null },
        });
        ok++;
      } catch (e: any) {
        fail++;
        const msg = String(e?.message ?? "");
        toast.error(
          msg.includes("duplicate key") || msg.includes("unique constraint")
            ? `「${d.name}」已存在，不能重复创建。如需把它放到某个一级标签下，请在列表中编辑该标签并选择父级`
            : `「${d.name}」创建失败：${msg || "未知错误"}`,
        );
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
          parentId: isCalc ? editForm.parentId : null,
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
    if (tags.some((candidate) => candidate.parent_id === t.id)) {
      toast.error("请先删除或移动该一级标签下的二级标签");
      return;
    }
    if (!confirm(`确定删除「${t.name}」？所有题目上的该标签也会被移除。`)) return;
    try {
      await deleteTagFn({ data: { id: t.id } });
      toast.success("已删除");
      await refreshTags();
      // also refresh links/count since deletion cascades
      const { data: linksRes } = await fetchAllLinks();
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
        data: { tagIds: Array.from(aiTagIds), scope: aiScope, bank: variant },
      });
      toast.success(
        `AI 扫描完成：共扫描 ${res.scanned ?? res.totalQuestions} 题，新增 ${res.inserted} 条标签`,
      );
      setAiOpen(false);
      // refresh links
      const { data: linksRes } = await fetchAllLinks();
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
            {isCalc ? "计算练习" : "分类题库"}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{isCalc ? "按知识点筛选计算题" : "按知识点浏览题目"}</h1>
        </div>
        {isCalc && <CalcImportDialog tags={tags} onImported={() => void loadAll()} />}
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
            {tagGroups.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                {tags.length === 0 ? "还没有知识点，点击右上角「管理知识点」添加。" : "没有匹配的知识点"}
              </div>
            ) : (
              tagGroups.map(({ parent, children }) => {
                const collapsed = collapsedGroupIds.has(parent.id);
                const groupTagIds = [parent, ...children];
                return (
                  <div key={parent.id}>
                    {groupTagIds.map((tag) => {
                      const checked = selectedTags.has(tag.id);
                      const count = tagCounts[tag.id] ?? 0;
                      const isChild = tag.id !== parent.id;
                      const hasChildren = tag.id === parent.id && children.length > 0;
                      if (isChild && collapsed) return null;
                      return (
                        <label
                          key={tag.id}
                          className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted ${checked ? "bg-muted" : ""} ${isChild ? "ml-5" : "font-medium"}`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleSelectTag(tag.id)} />
                          <span className="flex-1 truncate" title={tag.description ?? undefined}>
                            {tag.name}
                          </span>
                          <Badge
                            variant={count > 0 ? "secondary" : "outline"}
                            className="h-5 min-w-[2rem] justify-center px-1.5 text-[10px]"
                          >
                            {count}
                          </Badge>
                          {hasChildren && (
                            <button
                              type="button"
                              aria-label={collapsed ? "展开二级标签" : "折叠二级标签"}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCollapsedGroupIds((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(parent.id)) n.delete(parent.id);
                                  else n.add(parent.id);
                                  return n;
                                });
                              }}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          )}
                        </label>
                      );
                    })}
                  </div>
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
                       {!isCalc && paper && (
                        <Link
                          to="/admin/question-bank/$paperId"
                          params={{ paperId: paper.id }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {paper.name}
                        </Link>
                      )}
                       {!isCalc && <span>·</span>}
                       {!isCalc && <span>第 {q.question_number} 题</span>}
                      {q.correct_answer && (
                        <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-700">
                          <span>答案</span>
                          <MathText text={q.correct_answer} />
                        </span>
                      )}
                      {q.stem_render_mode === "image" && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                          题干图片模式
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1.5">
                        {(q.image_path || q.options_image_path) && (
                          <button
                            type="button"
                            onClick={() =>
                              setOriginalDialog({
                                open: true,
                                 title: isCalc
                                   ? "原题"
                                   : `${paper ? paper.name + " · " : ""}第 ${q.question_number} 题 · 原题`,
                                questionId: q.id,
                                stemPath: q.image_path,
                                optionsPath: q.options_image_path,
                                stemUrl: q.image_path ? imageUrls[q.image_path] ?? null : null,
                                optionsUrl: q.options_image_path
                                  ? imageUrls[q.options_image_path] ?? null
                                  : null,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <ImageIcon className="h-3 w-3" />
                            查看原题
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditQuestion(q)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                          修改
                        </button>
                        <button
                          type="button"
                          disabled={deletingQ === q.id}
                          onClick={() => handleDeleteQuestion(q)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {deletingQ === q.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          删除
                        </button>
                      </span>
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
                      {tids.length === 0 && (
                        <span className="text-[11px] text-muted-foreground">未打标签</span>
                      )}
                      {tids.map((tid) => {
                        const t = tagById[tid];
                        if (!t) return null;
                        return (
                          <span
                            key={tid}
                            className="group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                            style={
                              t.color
                                ? { borderColor: t.color, backgroundColor: t.color + "1a" }
                                : undefined
                            }
                            title={t.description ?? undefined}
                          >
                            {t.name}
                            <button
                              onClick={() => removeQuestionTag(q.id, tid)}
                              className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                              aria-label="移除"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        );
                      })}
                      <Popover
                        open={openTagPopoverFor === q.id}
                        onOpenChange={(o) => {
                          setOpenTagPopoverFor(o ? q.id : null);
                          if (o) setPopoverSearch("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                            disabled={savingTagsFor === q.id}
                          >
                            {savingTagsFor === q.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            添加标签
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="start">
                          <div className="relative mb-2">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={popoverSearch}
                              onChange={(e) => setPopoverSearch(e.target.value)}
                              placeholder="搜索..."
                              className="h-7 pl-7 text-xs"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-64 space-y-0.5 overflow-y-auto">
                            {tags
                              .filter((t) => {
                                const kw = popoverSearch.trim().toLowerCase();
                                if (!kw) return true;
                                return (
                                  t.name.toLowerCase().includes(kw) ||
                                  (t.description ?? "").toLowerCase().includes(kw)
                                );
                              })
                              .map((t) => {
                                const checked = tids.includes(t.id);
                                return (
                                  <label
                                    key={t.id}
                                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleQuestionTag(q.id, t.id)}
                                    />
                                    <span className="flex-1 truncate" title={t.description ?? undefined}>
                                      {t.name}
                                    </span>
                                  </label>
                                );
                              })}
                            {tags.length === 0 && (
                              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                                还没有知识点
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
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
               {tags.filter((t) => !t.parent_id).flatMap((parent) => [parent, ...childTags(parent.id)]).map((t) => (
                <div key={t.id} className="flex items-start gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                       {t.parent_id && <span className="mr-2 text-muted-foreground">└</span>}
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
                 {isCalc && (
                   <div className="space-y-1.5">
                     <Label>层级</Label>
                     <Select
                       value={d.parentId ?? "root"}
                       onValueChange={(value) => updateDraft(idx, { parentId: value === "root" ? null : value })}
                     >
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="root">一级标签</SelectItem>
                         {rootTags.map((tag) => <SelectItem key={tag.id} value={tag.id}>二级标签，归入：{tag.name}</SelectItem>)}
                       </SelectContent>
                     </Select>
                   </div>
                 )}
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
            {isCalc && (
              <div className="space-y-2">
                <Label>层级</Label>
                <Select
                  value={editForm.parentId ?? "root"}
                  onValueChange={(value) => setEditForm((f) => ({ ...f, parentId: value === "root" ? null : value }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">一级标签</SelectItem>
                    {rootTags.filter((tag) => tag.id !== editing?.id).map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>二级标签，归入：{tag.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI auto-tag by selected tags */}
      <Dialog open={aiOpen} onOpenChange={(o) => !aiRunning && setAiOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 更新标签
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              选择若干标签，AI 会扫描题库并为符合条件的题目自动加上对应标签（不会移除已有的其他标签）。
            </p>
            <div className="space-y-2">
              <Label>处理范围</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={aiScope === "missing" ? "default" : "outline"}
                  onClick={() => setAiScope("missing")}
                >
                  仅处理尚未打这些标签的题
                </Button>
                <Button
                  size="sm"
                  variant={aiScope === "all" ? "default" : "outline"}
                  onClick={() => setAiScope("all")}
                >
                  全部题目
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>选择标签 ({aiTagIds.size})</Label>
                {aiTagIds.size > 0 && (
                  <button
                    onClick={() => setAiTagIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    清空
                  </button>
                )}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={aiSearch}
                  onChange={(e) => setAiSearch(e.target.value)}
                  placeholder="搜索标签..."
                  className="h-8 pl-7 text-sm"
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {tags
                  .filter((t) => {
                    const kw = aiSearch.trim().toLowerCase();
                    if (!kw) return true;
                    return (
                      t.name.toLowerCase().includes(kw) ||
                      (t.description ?? "").toLowerCase().includes(kw)
                    );
                  })
                  .sort((a, b) => Number(Boolean(a.parent_id)) - Number(Boolean(b.parent_id)))
                  .map((t) => {
                    const checked = aiTagIds.has(t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            setAiTagIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(t.id)) n.delete(t.id);
                              else n.add(t.id);
                              return n;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                           <div className={`font-medium ${t.parent_id ? "pl-4" : ""}`}>
                             {t.parent_id ? `└ ${t.name}` : t.name}
                           </div>
                          {t.description && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {t.description}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)} disabled={aiRunning}>
              取消
            </Button>
            <Button onClick={runAiUpdate} disabled={aiRunning || aiTagIds.size === 0} className="gap-1.5">
              {aiRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  扫描中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  开始扫描
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Original image dialog */}
      <Dialog
        open={originalDialog.open}
        onOpenChange={(o) => setOriginalDialog((d) => ({ ...d, open: o }))}
      >
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{originalDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {originalDialog.questionId && (
              <>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">题干截图</div>
                  <EditableQuestionImage
                    questionId={originalDialog.questionId}
                    field="image_path"
                    signedUrl={originalDialog.stemUrl}
                    alt="原题题干"
                    className="w-full rounded-md border"
                    onUpdated={(path, url) => {
                      setOriginalDialog((d) => ({ ...d, stemPath: path, stemUrl: url }));
                      setImageUrls((m) => ({ ...m, [path]: url }));
                      setQuestions((qs) =>
                        qs.map((qq) =>
                          qq.id === originalDialog.questionId
                            ? { ...qq, image_path: path }
                            : qq,
                        ),
                      );
                    }}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">选项截图</div>
                  <EditableQuestionImage
                    questionId={originalDialog.questionId}
                    field="options_image_path"
                    signedUrl={originalDialog.optionsUrl}
                    alt="原题选项"
                    className="w-full rounded-md border"
                    onUpdated={(path, url) => {
                      setOriginalDialog((d) => ({ ...d, optionsPath: path, optionsUrl: url }));
                      setImageUrls((m) => ({ ...m, [path]: url }));
                      setQuestions((qs) =>
                        qs.map((qq) =>
                          qq.id === originalDialog.questionId
                            ? { ...qq, options_image_path: path }
                            : qq,
                        ),
                      );
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
