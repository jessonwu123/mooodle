import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Loader2, Search, X, ArrowUp, ArrowDown, ClipboardList, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/math-text";
import { listTags } from "@/lib/math-tags.functions";

export const Route = createFileRoute("/admin/homework")({
  component: HomeworkPage,
  head: () => ({
    meta: [
      { title: "布置作业 · 教师端" },
      { name: "description", content: "按题库和知识点筛选题目，组成作业并导出 PDF。" },
      { property: "og:title", content: "布置作业 · 教师端" },
      { property: "og:description", content: "按题库和知识点筛选题目，组成作业并导出 PDF。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Tag = { id: string; name: string; category: string; parent_id: string | null };
type Paper = { id: string; year: number | null; name: string };
type Q = {
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
  image_path: string | null;
  options_image_path: string | null;
  answer_type: string | null;
};

const BUCKET = "math-question-images";

async function toDataUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => res(null);
    r.readAsDataURL(data);
  });
}

function HomeworkPage() {
  const fetchTags = useServerFn(listTags);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [papers, setPapers] = useState<Record<string, Paper>>({});
  const [questions, setQuestions] = useState<Q[]>([]);
  const [qTags, setQTags] = useState<Record<string, string[]>>({});

  const [source, setSource] = useState<"all" | "exam" | "calc">("all");
  const [paperFilter, setPaperFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const [title, setTitle] = useState("课后作业");
  const [withAnswers, setWithAnswers] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [renderData, setRenderData] = useState<{ qs: Q[]; imgs: Record<string, string> } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, q, p, l] = await Promise.all([
          fetchTags(),
          supabase
            .from("math_questions")
            .select("id, paper_id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, image_path, options_image_path, answer_type")
            .order("question_number"),
          supabase.from("math_papers").select("id, year, name").order("year", { ascending: false }),
          (async () => {
            const all: any[] = [];
            for (let from = 0; ; from += 1000) {
              const { data } = await supabase
                .from("math_question_tags")
                .select("question_id, tag_id")
                .order("id")
                .range(from, from + 999);
              all.push(...(data ?? []));
              if (!data || data.length < 1000) break;
            }
            return { data: all };
          })(),
        ]);
        setTags((t.tags ?? []) as Tag[]);
        setQuestions((q.data ?? []) as Q[]);
        const pm: Record<string, Paper> = {};
        (p.data ?? []).forEach((x: any) => (pm[x.id] = x));
        setPapers(pm);
        const m: Record<string, string[]> = {};
        (l.data ?? []).forEach((x: any) => (m[x.question_id] ||= []).push(x.tag_id));
        setQTags(m);
      } catch (e: any) {
        toast.error(e?.message ?? "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const qById = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);
  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t])), [tags]);
  const calcChildren = (parentId: string) => tags.filter((tag) => tag.parent_id === parentId).map((tag) => tag.id);
  const paperSource = useMemo(() => {
    const m: Record<string, "exam" | "calc"> = {};
    questions.forEach((q: any) => { m[q.paper_id] = q.answer_type === "计算" ? "calc" : "exam"; });
    return m;
  }, [questions]);
  const paperList = useMemo(
    () => Object.values(papers).filter((p) => paperSource[p.id] !== "calc" && source !== "calc").sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name)),
    [papers, source, paperSource],
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return questions
      .filter((q: any) => (source === "all" ? true : source === "calc" ? q.answer_type === "计算" : q.answer_type !== "计算"))
      .filter((q) => (paperFilter.size ? paperFilter.has(q.paper_id) : true))
      .filter((q) => tagFilter.size ? Array.from(tagFilter).some((id) => [id, ...calcChildren(id)].some((tagId) => (qTags[q.id] ?? []).includes(tagId))) : true)
      .filter((q) => (kw ? q.stem.toLowerCase().includes(kw) : true))
      .sort((a, b) => {
        const pa = papers[a.paper_id], pb = papers[b.paper_id];
        return (pb?.year ?? 0) - (pa?.year ?? 0) || (pa?.name ?? "").localeCompare(pb?.name ?? "") || a.question_number - b.question_number;
      });
  }, [questions, paperFilter, tagFilter, keyword, qTags, papers, source, tags]);

  const selSet = useMemo(() => new Set(selected), [selected]);
  const toggleSel = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const move = (i: number, d: number) =>
    setSelected((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const reorder = (from: number, to: number) =>
    setSelected((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.length || to >= s.length) return s;
      const n = [...s];
      const [id] = n.splice(from, 1);
      n.splice(to, 0, id!);
      return n;
    });
  const toggleSet = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    fn(n);
  };

  const paperLabel = (id: string) => {
    const p = papers[id];
    return p ? `${p.year ? p.year + " " : ""}${p.name}` : "";
  };

  const isCalcQuestion = (q: Q) => q.answer_type === "计算";

  const handleExport = async () => {
    if (!selected.length) return toast.error("请先勾选题目");
    setExporting(true);
    try {
      const qs = selected.map((id) => qById[id]).filter(Boolean) as Q[];
      const imgs: Record<string, string> = {};
      await Promise.all(
        qs.flatMap((q) =>
          [q.image_path, q.options_image_path].filter(Boolean).map(async (p) => {
            const d = await toDataUrl(p!);
            if (d) imgs[p!] = d;
          }),
        ),
      );
      setRenderData({ qs, imgs });
      await new Promise((r) => setTimeout(r, 400));
      const root = printRef.current;
      if (!root) throw new Error("渲染失败");
      await Promise.all(
        Array.from(root.querySelectorAll("img")).map((img) =>
          img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))),
        ),
      );
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas-pro")]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const maxW = pw - margin * 2;
      let y = margin;
      let first = true;
      const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-block]"));
      for (const el of blocks) {
        if (el.dataset.block === "break" ) {
          pdf.addPage();
          y = margin;
          continue;
        }
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
        let w = maxW;
        let h = (canvas.height / canvas.width) * w;
        if (h > ph - margin * 2) {
          h = ph - margin * 2;
          w = (canvas.width / canvas.height) * h;
        }
        if (!first && y + h > ph - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, y, w, h);
        y += h + 4;
        first = false;
      }
      const total = pdf.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        pdf.text(`${i} / ${total}`, pw / 2, ph - 5, { align: "center" });
      }
      pdf.save(`${title || "作业"}.pdf`);
      toast.success("作业已导出");
    } catch (e: any) {
      toast.error(`导出失败：${e?.message ?? e}`);
    } finally {
      setRenderData(null);
      setExporting(false);
    }
  };

  const visibleTags = tags.filter((t: any) => source === "all" || (source === "calc" ? t.category === "calc" : t.category !== "calc")).filter((t) => t.name.toLowerCase().includes(tagSearch.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ClipboardList className="h-5 w-5" />
          布置作业
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 min-w-0">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {([["all", "全部"], ["exam", "题库"], ["calc", "计算练习"]] as const).map(([k, l]) => (
                <Button key={k} size="sm" variant={source === k ? "default" : "outline"} onClick={() => { setSource(k); setPaperFilter(new Set()); setTagFilter(new Set()); }}>
                  {l}
                </Button>
              ))}
            </div>
            {source !== "calc" && <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">题库（不选 = 全部）</Label>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {paperList.map((p) => (
                  <Badge
                    key={p.id}
                    variant={paperFilter.has(p.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleSet(paperFilter, p.id, setPaperFilter)}
                  >
                    {paperLabel(p.id)}
                  </Badge>
                ))}
              </div>
            </div>}
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">知识点（不选 = 全部）</Label>
                <Input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="搜索知识点" className="h-7 max-w-40 text-xs" />
              </div>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {visibleTags
                  .filter((tag) => !tag.parent_id)
                  .flatMap((parent) => [parent, ...visibleTags.filter((tag) => tag.parent_id === parent.id)])
                  .map((t) => (
                  <Badge
                    key={t.id}
                    variant={tagFilter.has(t.id) ? "default" : "secondary"}
                    className={`cursor-pointer ${t.parent_id ? "ml-3" : "font-semibold"}`}
                    onClick={() => toggleSet(tagFilter, t.id, setTagFilter)}
                  >
                    {t.parent_id ? `└ ${t.name}` : t.name}
                  </Badge>
                ))}
                {!visibleTags.length && <span className="text-xs text-muted-foreground">暂无知识点</span>}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按题干关键词搜索" className="pl-8" />
            </div>
          </Card>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>共 {filtered.length} 题</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected((s) => [...s, ...filtered.map((q) => q.id).filter((id) => !s.includes(id))])}
                disabled={!filtered.length}
              >
                全选当前结果
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 200).map((q) => (
                <Card
                  key={q.id}
                  className={`flex cursor-pointer gap-3 p-3 transition ${selSet.has(q.id) ? "ring-2 ring-primary" : ""}`}
                  onClick={() => toggleSel(q.id)}
                >
                  <Checkbox checked={selSet.has(q.id)} className="mt-1" onClick={(e) => e.stopPropagation()} onCheckedChange={() => toggleSel(q.id)} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {!isCalcQuestion(q) && (
                        <span className="whitespace-nowrap">{paperLabel(q.paper_id)} · 第 {q.question_number} 题</span>
                      )}
                      {q.image_path && <Badge variant="outline" className="text-[10px]">有原题截图</Badge>}
                      {(qTags[q.id] ?? []).map((t) => tagById[t] && (
                        <Badge key={t} variant="secondary" className="text-[10px]">{tagById[t]!.name}</Badge>
                      ))}
                    </div>
                    <div className="line-clamp-3 text-sm">
                      <MathText text={q.stem} />
                    </div>
                  </div>
                </Card>
              ))}
              {filtered.length > 200 && (
                <p className="text-center text-xs text-muted-foreground">仅显示前 200 题，请进一步筛选</p>
              )}
            </div>
          )}
        </div>

        <Card className="h-fit space-y-3 p-4 lg:sticky lg:top-4">
          <div className="font-medium">已选 {selected.length} 题</div>
          <div>
            <Label className="text-xs text-muted-foreground">作业标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={withAnswers} onCheckedChange={(v) => setWithAnswers(!!v)} />
            末尾附答案页
          </label>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {selected.map((id, i) => {
              const q = qById[id];
              if (!q) return null;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) reorder(dragIndex, i);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex cursor-grab items-center gap-1 rounded border border-border/60 px-1.5 py-1 text-xs active:cursor-grabbing ${
                    dragIndex === i ? "opacity-50" : ""
                  }`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="w-5 shrink-0 font-medium">{i + 1}.</span>
                   <span className="min-w-0 flex-1 truncate">
                     {isCalcQuestion(q) ? <MathText text={q.stem} /> : `${paperLabel(q.paper_id)} 第${q.question_number}题`}
                   </span>
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    disabled={i === 0}
                    aria-label="上移"
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    disabled={i === selected.length - 1}
                    aria-label="下移"
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="移除"
                    onClick={() => toggleSel(id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {!selected.length && <p className="text-xs text-muted-foreground">在左侧勾选题目</p>}
            {selected.length > 1 && (
              <p className="text-xs text-muted-foreground">拖动 ↕ 或用箭头调整顺序，导出按此顺序排列</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected([])} disabled={!selected.length}>清空</Button>
            <Button className="flex-1 gap-1.5" onClick={handleExport} disabled={exporting || !selected.length}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              导出 PDF
            </Button>
          </div>
        </Card>
      </div>

      {renderData && (
        <div style={{ position: "fixed", left: -10000, top: 0, width: 760, background: "#fff", color: "#111" }} ref={printRef}>
          <div data-block="title" style={{ padding: "8px 4px 12px", borderBottom: "1px solid #ddd" }}>
            <div style={{ fontSize: 24, fontWeight: 700, textAlign: "center" }}>{title}</div>
            <div style={{ fontSize: 13, marginTop: 8, display: "flex", justifyContent: "space-between", color: "#555" }}>
              <span>姓名：__________</span>
              <span>日期：__________</span>
              <span>共 {renderData.qs.length} 题</span>
            </div>
          </div>
          {renderData.qs.map((q, i) => {
            const stemImg = q.image_path ? renderData.imgs[q.image_path] : null;
            const optImg = q.options_image_path ? renderData.imgs[q.options_image_path] : null;
            const opts = (["a", "b", "c", "d", "e"] as const)
              .map((k) => [k.toUpperCase(), q[`option_${k}` as keyof Q] as string | null] as const)
              .filter(([, v]) => v);
            return (
              <div key={q.id} data-block="q" style={{ padding: "12px 4px", fontSize: 15, lineHeight: 1.7 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <b style={{ flexShrink: 0 }}>{i + 1}.</b>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {stemImg ? (
                      <img src={stemImg} style={{ maxWidth: "100%" }} alt="" />
                    ) : (
                      <MathText text={q.stem} />
                    )}
                    {optImg ? (
                      <img src={optImg} style={{ maxWidth: "100%", marginTop: 6 }} alt="" />
                    ) : !stemImg || !q.image_path ? (
                      opts.length > 0 && (
                        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                          {opts.map(([k, v]) => (
                            <div key={k}>({k}) <MathText text={v!} /></div>
                          ))}
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {withAnswers && (
            <>
              <div data-block="break" />
              <div data-block="answers" style={{ padding: "8px 4px", fontSize: 15 }}>
                <div style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>参考答案</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  {renderData.qs.map((q, i) => (
                    <div key={q.id}>{i + 1}. <MathText text={q.correct_answer || "—"} /></div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
