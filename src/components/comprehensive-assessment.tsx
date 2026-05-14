import { useEffect, useState } from "react";
import { Plus, Trash2, BookOpen, Brain, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

type Category = "knowledge" | "thinking" | "learning_quality";

interface Item {
  id: string;
  category: Category;
  item_name: string;
  rating: number | null;
  comment: string | null;
  sort_order: number;
}

const CATEGORIES: { key: Category; label: string; icon: typeof BookOpen; desc: string }[] = [
  { key: "knowledge", label: "知识点评估", icon: BookOpen, desc: "对各学科知识点的掌握情况" },
  { key: "thinking", label: "核心思维能力评估", icon: Brain, desc: "逻辑、分析、创造等思维能力" },
  { key: "learning_quality", label: "学习品质", icon: Sparkles, desc: "学习习惯、态度与品质" },
];

interface Props {
  studentId: string;
  editable: boolean;
}

export function ComprehensiveAssessment({ studentId, editable }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("assessment_items")
        .select("id, category, item_name, rating, comment, sort_order")
        .eq("student_id", studentId)
        .order("category")
        .order("sort_order");
      if (!cancelled) {
        setItems((data ?? []) as Item[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const addItem = (item: Item) => setItems((prev) => [...prev, item]);
  const patchItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  if (loading) {
    return <div className="text-center text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <Accordion type="multiple" className="space-y-3">
      {CATEGORIES.map((cat) => {
        const list = items.filter((i) => i.category === cat.key);
        const Icon = cat.icon;
        return (
          <AccordionItem
            key={cat.key}
            value={cat.key}
            className="rounded-2xl border border-border bg-card px-5 shadow-[var(--shadow-card)]"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-base font-semibold text-foreground">{cat.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {cat.desc} · 共 {list.length} 项
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CategoryTable
                category={cat.key}
                studentId={studentId}
                items={list}
                editable={editable}
                onAdd={addItem}
                onPatch={patchItem}
                onRemove={removeItem}
              />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function CategoryTable({
  category,
  studentId,
  items,
  editable,
  onAdd,
  onPatch,
  onRemove,
}: {
  category: Category;
  studentId: string;
  items: Item[];
  editable: boolean;
  onAdd: (item: Item) => void;
  onPatch: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
}) {
  const [newNames, setNewNames] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const names = newNames
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const rows = names.map((name, i) => ({
      student_id: studentId,
      category,
      item_name: name,
      rating: null,
      sort_order: items.length + i,
      created_by: u.user?.id,
    }));
    const { data, error } = await supabase
      .from("assessment_items")
      .insert(rows)
      .select("id, category, item_name, rating, comment, sort_order");
    setBusy(false);
    if (error || !data) {
      toast.error("添加失败：" + (error?.message ?? ""));
      return;
    }
    (data as Item[]).forEach(onAdd);
    toast.success(`已添加 ${data.length} 项`);
    setNewNames("");
  };

  const handleUpdate = async (id: string, patch: Partial<Item>) => {
    onPatch(id, patch); // optimistic
    const { error } = await supabase
      .from("assessment_items")
      .update(patch)
      .eq("id", id);
    if (error) toast.error("保存失败");
  };

  const handleDelete = async (id: string) => {
    onRemove(id); // optimistic
    const { error } = await supabase.from("assessment_items").delete().eq("id", id);
    if (error) toast.error("删除失败");
  };

  return (
    <div className="space-y-3 pt-2">
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          暂无评估项目
        </div>
      )}
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          editable={editable}
          onUpdate={(patch) => handleUpdate(item.id, patch)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
      {editable && (
        <div className="flex items-center gap-2 pt-2">
          <Input
            value={newName}
            placeholder="新增评估项目名称"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button
            type="button"
            onClick={handleAdd}
            disabled={busy || !newName.trim()}
            className="gap-1.5 bg-green-500 text-primary-foreground hover:bg-green-600"
          >
            <Plus className="h-4 w-4" />
            添加
          </Button>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  editable,
  onUpdate,
  onDelete,
}: {
  item: Item;
  editable: boolean;
  onUpdate: (patch: Partial<Item>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.item_name);
  const [comment, setComment] = useState(item.comment ?? "");

  useEffect(() => {
    setName(item.item_name);
    setComment(item.comment ?? "");
  }, [item.id, item.item_name, item.comment]);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-3">
          {editable ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== item.item_name) onUpdate({ item_name: name.trim() });
              }}
              className="font-medium"
            />
          ) : (
            <div className="font-medium text-foreground">{item.item_name}</div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">评分</span>
            <StarRating
              value={item.rating ?? 0}
              readOnly={!editable}
              onChange={(v) => onUpdate({ rating: v })}
              size="sm"
            />
          </div>
          {editable ? (
            <Textarea
              value={comment}
              rows={2}
              placeholder="备注（可选）"
              onChange={(e) => setComment(e.target.value)}
              onBlur={() => {
                if ((comment || null) !== (item.comment || null))
                  onUpdate({ comment: comment.trim() || null });
              }}
            />
          ) : (
            item.comment && (
              <div className="whitespace-pre-wrap rounded-lg bg-background/60 px-3 py-2 text-sm text-foreground">
                {item.comment}
              </div>
            )
          )}
        </div>
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
