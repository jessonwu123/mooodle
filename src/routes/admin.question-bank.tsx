import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Upload,
  Trash2,
  Loader2,
  BookOpen,
  ImageIcon,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { extractPaperQuestions, saveMathPaper, deleteMathPaper } from "@/lib/math-papers.functions";
import {
  renderPdfPages,
  renderPdfPageCanvas,
  cropCanvasToBlob,
  type RenderedPage,
} from "@/lib/pdf-render";

export const Route = createFileRoute("/admin/question-bank")({
  component: QuestionBankPage,
});

interface PaperRow {
  id: string;
  year: number;
  name: string;
  question_count: number;
  created_at: string;
}

interface ExtractedQuestion {
  number: number;
  stem: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  correct_answer: string | null;
  has_figure: boolean;
  page_index: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  imageDataUrl?: string | null;
  imageBlob?: Blob | null;
}

const QUESTION_BATCHES = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 25],
] as const;

function extractYearFromFilename(name: string): number | null {
  const m = name.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

async function uploadRenderedPageImages(
  pages: RenderedPage[],
  prefix: string,
  label: "试卷" | "答案",
  setStage: (stage: string) => void,
) {
  const bucket = supabase.storage.from("math-papers");
  const paths: string[] = [];
  for (const page of pages) {
    const pageNo = page.pageIndex + 1;
    const path = `${prefix}/${label === "试卷" ? "paper" : "answer"}-${String(pageNo).padStart(2, "0")}.jpg`;
    setStage(`上传${label}页面图片 ${pageNo}/${pages.length}...`);
    const { error } = await bucket.upload(path, page.blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) throw new Error(`上传${label}页面图片失败：${error.message}`);
    paths.push(path);
  }

  const { data, error } = await bucket.createSignedUrls(paths, 60 * 60);
  if (error) throw new Error(`生成${label}页面访问链接失败：${error.message}`);
  const signedUrls = (data ?? []).map((item) => item.signedUrl).filter(Boolean);
  if (signedUrls.length !== paths.length) throw new Error(`${label}页面访问链接生成不完整`);
  return { paths, signedUrls };
}

function QuestionBankPage() {
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [year, setYear] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [processError, setProcessError] = useState<string>("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedQuestion[]>([]);
  const [paperPath, setPaperPath] = useState<string>("");
  const [answerPath, setAnswerPath] = useState<string | null>(null);
  const [savingPreview, setSavingPreview] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("math_papers")
      .select("id, year, name, question_count, created_at")
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("加载试卷列表失败");
    } else {
      setPapers((data ?? []) as PaperRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onPaperFile = (f: File | null) => {
    setPaperFile(f);
    if (f) {
      const y = extractYearFromFilename(f.name);
      if (y) setYear(String(y));
      if (!name) setName(f.name.replace(/\.pdf$/i, ""));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paperFile) return toast.error("请上传试卷 PDF");
    const yNum = Number(year);
    if (!yNum || yNum < 1900 || yNum > 2100) return toast.error("请填写有效年份");
    if (!name.trim()) return toast.error("请填写试卷名称");

    setBusy(true);
    setProcessError("");
    try {
      setStage("上传试卷 PDF...");
      const ts = Date.now();
      const pPath = `${yNum}/${ts}-paper.pdf`;
      const { error: e1 } = await supabase.storage
        .from("math-papers")
        .upload(pPath, paperFile, { contentType: "application/pdf", upsert: false });
      if (e1) throw new Error("上传试卷失败：" + e1.message);

      let aPath: string | null = null;
      if (answerFile) {
        setStage("上传答案 PDF...");
        aPath = `${yNum}/${ts}-answer.pdf`;
        const { error: e2 } = await supabase.storage
          .from("math-papers")
          .upload(aPath, answerFile, { contentType: "application/pdf", upsert: false });
        if (e2) throw new Error("上传答案失败：" + e2.message);
      }

      setStage("渲染试卷页面...");
      const paperPages = await renderPdfPages(paperFile, 1.15, 0.68);
      let answerPages: RenderedPage[] = [];
      if (answerFile) {
        setStage("渲染答案页面...");
        answerPages = await renderPdfPages(answerFile, 1.05, 0.68);
      }

      const imagePrefix = `${yNum}/${ts}-pages`;
      const { signedUrls: paperPageImages } = await uploadRenderedPageImages(
        paperPages,
        imagePrefix,
        "试卷",
        setStage,
      );
      const { signedUrls: answerPageImages } = answerPages.length
        ? await uploadRenderedPageImages(answerPages, imagePrefix, "答案", setStage)
        : { signedUrls: [] as string[] };
      const byNumber = new Map<number, ExtractedQuestion>();
      for (const [batchIndex, [questionStart, questionEnd]] of QUESTION_BATCHES.entries()) {
        setStage(`AI 抽取第 ${questionStart}-${questionEnd} 题（${batchIndex + 1}/${QUESTION_BATCHES.length}）...`);
        const result = await extractPaperQuestions({
          data: {
            paperPageImages,
            answerPageImages,
            questionStart,
            questionEnd,
          },
        });
        for (const raw of result.questions ?? []) {
          const q = raw as ExtractedQuestion;
          const number = Number(q.number);
          if (!Number.isInteger(number) || number < questionStart || number > questionEnd) continue;
          byNumber.set(number, {
            ...q,
            number,
            stem: q.stem ?? "",
            option_a: q.option_a ?? null,
            option_b: q.option_b ?? null,
            option_c: q.option_c ?? null,
            option_d: q.option_d ?? null,
            option_e: q.option_e ?? null,
            correct_answer: q.correct_answer ? q.correct_answer.toUpperCase().slice(0, 1) : null,
            has_figure: Boolean(q.has_figure),
            page_index: Number.isInteger(Number(q.page_index)) ? Number(q.page_index) : 0,
            bbox: q.bbox ?? null,
          });
        }
      }
      const qs = Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
      if (!qs?.length) throw new Error("AI 未抽取到题目");
      if (qs.length < 25) toast.warning(`只抽取到 ${qs.length} 道题，请在预览中检查`);

      setStage("裁剪题目配图...");
      const figurePages = new Map<number, ExtractedQuestion[]>();
      for (const q of qs) {
        if (q.has_figure && q.bbox && paperPages[q.page_index]) {
          figurePages.set(q.page_index, [...(figurePages.get(q.page_index) ?? []), q]);
        }
      }
      for (const [pageIndex, pageQuestions] of figurePages) {
        setStage(`裁剪第 ${pageIndex + 1} 页题目配图...`);
        const canvas = await renderPdfPageCanvas(paperFile, pageIndex, 1.15);
        try {
          for (const q of pageQuestions) {
            if (!q.bbox) continue;
            try {
              const blob = await cropCanvasToBlob(canvas, q.bbox);
              q.imageBlob = blob;
              q.imageDataUrl = URL.createObjectURL(blob);
            } catch (err) {
              console.error("crop failed", q.number, err);
            }
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }

      setPaperPath(pPath);
      setAnswerPath(aPath);
      setExtracted(qs);
      setUploadOpen(false);
      setPreviewOpen(true);
      toast.success(`已抽取 ${qs.length} 道题，请确认后入库`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "处理失败";
      setProcessError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const handleSavePreview = async () => {
    setSavingPreview(true);
    try {
      const yNum = Number(year);
      const ts = Date.now();
      // upload crops
      for (const q of extracted) {
        if (q.imageBlob) {
          const path = `${yNum}/${ts}/q${String(q.number).padStart(2, "0")}.png`;
          const { error } = await supabase.storage
            .from("math-question-images")
            .upload(path, q.imageBlob, { contentType: "image/png", upsert: true });
          if (error) {
            console.error("upload crop failed", q.number, error);
          } else {
            (q as ExtractedQuestion & { image_path?: string }).image_path = path;
          }
        }
      }

      const payload = extracted.map((q) => ({
        number: q.number,
        stem: q.stem,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        option_e: q.option_e,
        correct_answer: q.correct_answer,
        image_path: (q as ExtractedQuestion & { image_path?: string }).image_path ?? null,
      }));

      await saveMathPaper({
        data: {
          year: yNum,
          name: name.trim(),
          pdfPath: paperPath,
          answerPdfPath: answerPath,
          questions: payload,
        },
      });
      toast.success("已入库");
      setPreviewOpen(false);
      setExtracted([]);
      setPaperFile(null);
      setAnswerFile(null);
      setYear("");
      setName("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingPreview(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMathPaper({ data: { paperId: id } });
      toast.success("已删除");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              题库管理
            </div>
            <h1 className="mt-1 text-2xl font-bold text-foreground">数学试卷题库</h1>
          </div>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Upload className="h-4 w-4" />
              上传新试卷
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>上传试卷 PDF</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label>试卷 PDF</Label>
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => onPaperFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>答案 PDF（可选）</Label>
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setAnswerFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>年份</Label>
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2025"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>试卷名称</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="2025 AMC 8"
                    required
                  />
                </div>
              </div>
              {busy && (
                <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {stage}
                </div>
              )}
              {processError && !busy && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {processError}
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? "处理中..." : "上传并抽题"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : papers.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center text-sm text-muted-foreground">
          还没有任何试卷。点击右上角「上传新试卷」开始。
        </div>
      ) : (
        <div className="space-y-2">
          {papers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border bg-card p-4"
            >
              <Link
                to="/admin/question-bank/$paperId"
                params={{ paperId: p.id }}
                className="flex-1"
              >
                <div className="font-medium">
                  {p.year} · {p.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.question_count} 道题 · 上传于 {new Date(p.created_at).toLocaleDateString()}
                </div>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      删除「{p.year} {p.name}」？
                    </AlertDialogTitle>
                    <AlertDialogDescription>该试卷及其全部题目都会被删除。</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(p.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              预览 · {year} {name}（{extracted.length} 题）
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {extracted.map((q, idx) => (
              <QuestionEditor
                key={q.number}
                q={q}
                onChange={(patch) => {
                  const next = [...extracted];
                  next[idx] = { ...q, ...patch };
                  setExtracted(next);
                }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={savingPreview}
            >
              取消
            </Button>
            <Button onClick={handleSavePreview} disabled={savingPreview}>
              {savingPreview ? "入库中..." : "确认入库"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionEditor({
  q,
  onChange,
}: {
  q: ExtractedQuestion;
  onChange: (patch: Partial<ExtractedQuestion>) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">
          第 {q.number} 题
          {q.correct_answer && (
            <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
              答案 {q.correct_answer}
            </span>
          )}
          {q.has_figure && (
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
              <ImageIcon className="h-3 w-3" /> 含图
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
          {editing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
        </Button>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={q.stem}
            onChange={(e) => onChange({ stem: e.target.value })}
            rows={3}
            className="text-xs"
          />
          {(["a", "b", "c", "d", "e"] as const).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-5 text-xs font-bold">{k.toUpperCase()}</span>
              <Input
                value={(q[`option_${k}` as const] as string | null) ?? ""}
                onChange={(e) =>
                  onChange({ [`option_${k}`]: e.target.value } as Partial<ExtractedQuestion>)
                }
                className="h-7 text-xs"
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-xs">正确答案</span>
            <Input
              value={q.correct_answer ?? ""}
              onChange={(e) =>
                onChange({ correct_answer: e.target.value.toUpperCase().slice(0, 1) })
              }
              className="h-7 w-16 text-xs"
            />
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{q.stem}</div>
      )}
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {(["a", "b", "c", "d", "e"] as const).map((k) => {
          const v = q[`option_${k}` as const] as string | null;
          if (!v) return null;
          return (
            <div key={k}>
              <span className="font-semibold">{k.toUpperCase()}.</span> {v}
            </div>
          );
        })}
      </div>
      {q.imageDataUrl && (
        <img
          src={q.imageDataUrl}
          alt={`第 ${q.number} 题配图`}
          className="mt-2 max-h-48 rounded border"
        />
      )}
    </div>
  );
}
