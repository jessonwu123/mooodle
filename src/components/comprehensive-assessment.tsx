import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, BookOpen, Brain, Sparkles, BellRing, Save } from "lucide-react";
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
import {
  type AssessmentCategory,
  type AssessmentTimestamps,
  isUnread,
  markViewed,
} from "@/lib/assessment-updates";
import { Sparkline } from "@/components/sparkline";

type Category = AssessmentCategory;

interface Item {
  id: string;
  category: Category;
  item_name: string;
  rating: number | null;
  comment: string | null;
  sort_order: number;
}

interface HistoryEntry {
  id: string;
  item_id: string;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

const CATEGORIES: { key: Category; label: string; icon: typeof BookOpen; desc: string }[] = [
  { key: "knowledge", label: "知识点评估", icon: BookOpen, desc: "对各学科知识点的掌握情况" },
  { key: "thinking", label: "核心思维能力评估", icon: Brain, desc: "逻辑、分析、创造等思维能力" },
  { key: "learning_quality", label: "学习品质", icon: Sparkles, desc: "学习习惯、态度与品质" },
];

interface Props {
  studentId: string;
  editable: boolean;
  timestamps: AssessmentTimestamps;
  onTimestampChange?: (category: Category, at: string) => void;
}

export function ComprehensiveAssessment({
  studentId,
  editable,
  timestamps,
  onTimestampChange,
}: Props) {
  const [items, setItems] = useState<Item[]>([]);
  // 已保存的快照，用于判断哪些项发生了实际变化
  const savedSnapshotRef = useRef<Map<string, { rating: number | null; comment: string | null }>>(
    new Map(),
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openValues, setOpenValues] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState<Category | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: itemsData }, { data: historyData }] = await Promise.all([
        supabase
          .from("assessment_items")
          .select("id, category, item_name, rating, comment, sort_order")
          .eq("student_id", studentId)
          .order("category")
          .order("sort_order"),
        supabase
          .from("assessment_item_history")
          .select("id, item_id, rating, comment, created_at")
          .eq("student_id", studentId)
          .order("created_at", { ascending: true }),
      ]);
      if (!cancelled) {
        const list = (itemsData ?? []) as Item[];
        setItems(list);
        const snap = new Map<string, { rating: number | null; comment: string | null }>();
        list.forEach((i) => snap.set(i.id, { rating: i.rating, comment: i.comment }));
        savedSnapshotRef.current = snap;
        setHistory((historyData ?? []) as HistoryEntry[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const addItem = (item: Item) => {
    setItems((prev) => [...prev, item]);
    savedSnapshotRef.current.set(item.id, { rating: item.rating, comment: item.comment });
  };
  const patchItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    savedSnapshotRef.current.delete(id);
    setHistory((prev) => prev.filter((h) => h.item_id !== id));
  };

  const handleSaveCategory = async (category: Category) => {
    setSavingCategory(category);
    const list = items.filter((i) => i.category === category);
    const snap = savedSnapshotRef.current;
    const changed = list.filter((i) => {
      const prev = snap.get(i.id);
      if (!prev) return false; // 新增项已在新增时落库
      return (
        (prev.rating ?? null) !== (i.rating ?? null) ||
        (prev.comment ?? null) !== (i.comment ?? null)
      );
    });
    if (changed.length === 0) {
      toast.info("没有需要保存的变更");
      setSavingCategory(null);
      return;
    }

    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;

    // 逐项更新 + 写入历史
    let failed = 0;
    const newHistoryEntries: HistoryEntry[] = [];
    for (const it of changed) {
      const { error: upErr } = await supabase
        .from("assessment_items")
        .update({ rating: it.rating, comment: it.comment })
        .eq("id", it.id);
      if (upErr) {
        failed += 1;
        continue;
      }
      const { data: h, error: hErr } = await supabase
        .from("assessment_item_history")
        .insert({
          item_id: it.id,
          student_id: studentId,
          rating: it.rating,
          comment: it.comment,
          created_by: uid,
        })
        .select("id, item_id, rating, comment, created_at")
        .single();
      if (!hErr && h) {
        newHistoryEntries.push(h as HistoryEntry);
        snap.set(it.id, { rating: it.rating, comment: it.comment });
      }
    }
    if (newHistoryEntries.length > 0) {
      setHistory((prev) => [...prev, ...newHistoryEntries]);
    }
    setSavingCategory(null);
    if (failed > 0) {
      toast.error(`保存失败 ${failed} 项`);
    } else {
      toast.success(`已保存 ${changed.length} 项变更`);
    }
  };

  const handleMarkUpdated = async (category: Category) => {
    const now = new Date().toISOString();
    const patch =
      category === "knowledge"
        ? { knowledge_updated_at: now }
        : category === "thinking"
          ? { thinking_updated_at: now }
          : { learning_quality_updated_at: now };
    const { error } = await supabase
      .from("students")
      .update(patch)
      .eq("id", studentId);
    if (error) {
      toast.error("更新失败：" + error.message);
      return;
    }
    onTimestampChange?.(category, now);
    toast.success("已通知家长查看更新");
  };

  const handleAccordionChange = (values: string[]) => {
    if (!editable) {
      const newlyOpened = values.filter((v) => !openValues.includes(v)) as Category[];
      newlyOpened.forEach((cat) => {
        const ts = timestamps[cat];
        if (ts) markViewed(studentId, cat, ts);
      });
    }
    setOpenValues(values);
  };

  if (loading) {
    return <div className="text-center text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <Accordion
      type="multiple"
      className="space-y-3"
      value={openValues}
      onValueChange={handleAccordionChange}
    >
      {CATEGORIES.map((cat) => {
        const list = items.filter((i) => i.category === cat.key);
        const Icon = cat.icon;
        const ts = timestamps[cat.key];
        const unread = !editable && isUnread(studentId, cat.key, ts);
        return (
          <AccordionItem
            key={cat.key}
            value={cat.key}
            className="rounded-2xl border border-border bg-card px-5 shadow-[var(--shadow-card)]"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex w-full items-center gap-3 pr-2">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                  {unread && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                    </span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                    {cat.label}
                    {unread && (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
                        有更新
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cat.desc} · 共 {list.length} 项
                    {ts && (
                      <>
                        {" · 上次更新 "}
                        {new Date(ts).toLocaleDateString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CategoryTable
                category={cat.key}
                studentId={studentId}
                items={list}
                history={history}
                editable={editable}
                onAdd={addItem}
                onPatch={patchItem}
                onRemove={removeItem}
              />
              {editable && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
                  <span className="mr-auto text-xs text-muted-foreground">
                    点击"保存"将当前评分作为新一次记录写入历史
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSaveCategory(cat.key)}
                    disabled={savingCategory === cat.key}
                    className="gap-1.5"
                  >
                    <Save className="h-4 w-4" />
                    {savingCategory === cat.key ? "保存中..." : "保存"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleMarkUpdated(cat.key)}
                    className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <BellRing className="h-4 w-4" />
                    标记为已更新
                  </Button>
                </div>
              )}
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
  history,
  editable,
  onAdd,
  onPatch,
  onRemove,
}: {
  category: Category;
  studentId: string;
  items: Item[];
  history: HistoryEntry[];
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

  const handleUpdateName = async (id: string, name: string) => {
    onPatch(id, { item_name: name });
    const { error } = await supabase
      .from("assessment_items")
      .update({ item_name: name })
      .eq("id", id);
    if (error) toast.error("名称保存失败");
  };

  const handleDelete = async (id: string) => {
    onRemove(id);
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
          history={history.filter((h) => h.item_id === item.id)}
          editable={editable}
          onLocalChange={(patch) => onPatch(item.id, patch)}
          onSaveName={(n) => handleUpdateName(item.id, n)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
      {editable && (
        <div className="space-y-2 pt-2">
          <Textarea
            value={newNames}
            placeholder="新增评估项目（可一次添加多个，每行一个，或用逗号分隔）"
            rows={2}
            onChange={(e) => setNewNames(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleAdd}
              disabled={busy || !newNames.trim()}
              className="gap-1.5 bg-green-500 text-primary-foreground hover:bg-green-600"
            >
              <Plus className="h-4 w-4" />
              添加（⌘/Ctrl+Enter）
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  history,
  editable,
  onLocalChange,
  onSaveName,
  onDelete,
}: {
  item: Item;
  history: HistoryEntry[];
  editable: boolean;
  onLocalChange: (patch: Partial<Item>) => void;
  onSaveName: (n: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.item_name);
  const [comment, setComment] = useState(item.comment ?? "");

  useEffect(() => {
    setName(item.item_name);
  }, [item.id, item.item_name]);
  useEffect(() => {
    setComment(item.comment ?? "");
  }, [item.id]);

  // 用历史 + 当前评分（如果与最后一次历史不同）构造趋势点
  const points = (() => {
    const pts = history
      .filter((h) => h.rating != null)
      .map((h) => ({ x: new Date(h.created_at).getTime(), y: h.rating as number }));
    return pts;
  })();

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-3">
          {editable ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== item.item_name) onSaveName(name.trim());
              }}
              className="font-medium"
            />
          ) : (
            <div className="font-medium text-foreground">{item.item_name}</div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">评分</span>
            <StarRating
              value={item.rating ?? 0}
              readOnly={!editable}
              onChange={(v) => onLocalChange({ rating: v })}
              size="sm"
            />
          </div>
          {!editable && (
            <div className="rounded-lg bg-background/60 px-3 py-2">
              <div className="mb-1 text-xs text-muted-foreground">评分趋势</div>
              <Sparkline points={points} />
            </div>
          )}
          {editable ? (
            <Textarea
              value={comment}
              rows={2}
              placeholder="备注（可选）"
              onChange={(e) => {
                setComment(e.target.value);
                onLocalChange({ comment: e.target.value.trim() || null });
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
