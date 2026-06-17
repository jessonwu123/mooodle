import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, Plus, Tags, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { listTags, createTag, updateTag, deleteTag } from "@/lib/math-tags.functions";

export const Route = createFileRoute("/admin/classified-bank")({
  component: ClassifiedBankPage,
  head: () => ({
    meta: [{ title: "分类题库 · 后台" }],
  }),
});

type TagRow = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  description: string | null;
};

type DraftRow = { name: string; description: string };

function ClassifiedBankPage() {
  const fetchTags = useServerFn(listTags);
  const createTagFn = useServerFn(createTag);
  const updateTagFn = useServerFn(updateTag);
  const deleteTagFn = useServerFn(deleteTag);

  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create (batch) dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([{ name: "", description: "" }]);
  const [saving, setSaving] = useState(false);

  // Edit (single) dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetchTags();
      setTags(r.tags as TagRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "加载标签失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const openCreate = () => {
    setDrafts([{ name: "", description: "" }]);
    setCreateOpen(true);
  };
  const openEdit = (t: TagRow) => {
    setEditing(t);
    setEditForm({ name: t.name, description: t.description ?? "" });
    setEditOpen(true);
  };

  const updateDraft = (idx: number, patch: Partial<DraftRow>) => {
    setDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
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
          data: {
            name: d.name,
            category: "knowledge",
            color: null,
            description: d.description || null,
          },
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
    await refresh();
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
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "保存失败");
    }
  };

  const handleDelete = async (t: TagRow) => {
    if (!confirm(`确定删除「${t.name}」？所有题目上的该标签也会被移除。`)) return;
    try {
      await deleteTagFn({ data: { id: t.id } });
      toast.success("已删除");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "删除失败");
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
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
          <h1 className="mt-1 text-2xl font-bold text-foreground">知识点管理</h1>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建知识点
        </Button>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">知识点库</h2>
          <span className="text-sm text-muted-foreground">
            共 {tags.length} 个；可在「原始题库」试卷详情页用 AI 自动给题目打 tag。
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : tags.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            还没有知识点。点右上角「新建知识点」开始添加。
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {tags.map((t) => (
              <div key={t.id} className="flex items-start gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.name}</div>
                  {t.description ? (
                    <div className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">
                      {t.description}
                    </div>
                  ) : null}
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
      </Card>

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
                  {drafts.length > 1 ? (
                    <button
                      onClick={() => removeDraft(idx)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="移除"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
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
