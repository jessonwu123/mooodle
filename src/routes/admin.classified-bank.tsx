import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, Plus, Tags, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listTags, createTag, updateTag, deleteTag } from "@/lib/math-tags.functions";

export const Route = createFileRoute("/admin/classified-bank")({
  component: ClassifiedBankPage,
  head: () => ({
    meta: [{ title: "分类题库 · 后台" }],
  }),
});

const CATEGORY_OPTIONS = [
  { value: "knowledge", label: "知识点" },
  { value: "topic", label: "题型" },
  { value: "difficulty", label: "难度" },
  { value: "skill", label: "技巧" },
  { value: "other", label: "其他" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);
const PRESET_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

type TagRow = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  description: string | null;
};

function ClassifiedBankPage() {
  const fetchTags = useServerFn(listTags);
  const createTagFn = useServerFn(createTag);
  const updateTagFn = useServerFn(updateTag);
  const deleteTagFn = useServerFn(deleteTag);

  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "knowledge",
    color: "#3b82f6",
    description: "",
  });

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
    setEditing(null);
    setForm({ name: "", category: "knowledge", color: "#3b82f6", description: "" });
    setOpen(true);
  };
  const openEdit = (t: TagRow) => {
    setEditing(t);
    setForm({
      name: t.name,
      category: t.category,
      color: t.color ?? "#3b82f6",
      description: t.description ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("请输入标签名");
      return;
    }
    try {
      if (editing) {
        await updateTagFn({
          data: {
            id: editing.id,
            name: form.name.trim(),
            category: form.category,
            color: form.color,
            description: form.description.trim() || null,
          },
        });
        toast.success("已更新");
      } else {
        await createTagFn({
          data: {
            name: form.name.trim(),
            category: form.category,
            color: form.color,
            description: form.description.trim() || null,
          },
        });
        toast.success("已创建");
      }
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "保存失败");
    }
  };

  const handleDelete = async (t: TagRow) => {
    if (!confirm(`确定删除标签「${t.name}」？所有题目上的该标签也会被移除。`)) return;
    try {
      await deleteTagFn({ data: { id: t.id } });
      toast.success("已删除");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "删除失败");
    }
  };

  const grouped = tags.reduce<Record<string, TagRow[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

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
          <h1 className="mt-1 text-2xl font-bold text-foreground">标签管理</h1>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建标签
        </Button>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">标签库</h2>
          <span className="text-sm text-muted-foreground">
            共 {tags.length} 个；可在「原始题库」试卷详情页用 AI 自动给题目打 tag。
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : tags.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            还没有标签。先点右上角「新建标签」，可按知识点/题型/难度等自由分类。
          </div>
        ) : (
          <div className="space-y-6">
            {CATEGORY_OPTIONS.filter((c) => grouped[c.value]?.length).map((c) => (
              <div key={c.value}>
                <div className="mb-2 text-sm font-semibold text-muted-foreground">
                  {c.label}（{grouped[c.value].length}）
                </div>
                <div className="flex flex-wrap gap-2">
                  {grouped[c.value].map((t) => (
                    <div
                      key={t.id}
                      className="group flex items-center gap-1.5 rounded-full border bg-muted/30 py-1 pl-2.5 pr-1 text-sm"
                      style={t.color ? { borderColor: t.color } : undefined}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color ?? "#94a3b8" }}
                      />
                      <span title={t.description ?? undefined}>{t.name}</span>
                      <button
                        onClick={() => openEdit(t)}
                        className="ml-1 rounded p-1 hover:bg-background"
                        aria-label="编辑"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="rounded p-1 text-destructive hover:bg-background"
                        aria-label="删除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {/* Unknown categories */}
            {Object.keys(grouped)
              .filter((k) => !CATEGORY_LABEL[k])
              .map((k) => (
                <div key={k}>
                  <div className="mb-2 text-sm font-semibold text-muted-foreground">
                    {k}（{grouped[k].length}）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {grouped[k].map((t) => (
                      <Badge key={t.id} variant="outline">
                        {t.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑标签" : "新建标签"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>分类</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>标签名</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="如：勾股定理 / 组合计数 / 中等难度"
              />
            </div>
            <div className="space-y-2">
              <Label>颜色</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>说明（可选，会作为提示给 AI）</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="例如：涉及直角三角形边长关系的题目"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
