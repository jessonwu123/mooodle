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
  Download,
  Sparkles,
  FileText,
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
import {
  extractPaperQuestions,
  createMathPaper,
  replaceMathPaperQuestions,
  getMathPaperPdfUrls,
  deleteMathPaper,
} from "@/lib/math-papers.functions";
import {
  renderPdfPages,
  renderPdfPageCanvas,
  cropCanvasToBlob,
  type RenderedPage,
} from "@/lib/pdf-render";

export const Route = createFileRoute("/admin/question-bank/")({
  component: QuestionBankPage,
});

interface PaperRow {
  id: string;
  year: number;
  name: string;
  question_count: number;
  created_at: string;
}

type Bbox = { x: number; y: number; w: number; h: number } | null;

interface ExtractedQuestion {
  number: number;
  stem: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  correct_answer: string | null;
  page_index: number;
  stem_bbox: Bbox;
  options_bbox: Bbox;
  stemImageBlob?: Blob | null;
  stemImageDataUrl?: string | null;
  optionsImageBlob?: Blob | null;
  optionsImageDataUrl?: string | null;
}

let paperRowsCache: PaperRow[] | null = null;
let paperRowsRequest: Promise<PaperRow[]> | null = null;
const PAPER_ROWS_CACHE_KEY = "math-paper-rows-cache";

function getCachedPaperRows() {
  if (paperRowsCache) return paperRowsCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PAPER_ROWS_CACHE_KEY);
    if (!raw) return null;
    paperRowsCache = JSON.parse(raw) as PaperRow[];
    return paperRowsCache;
  } catch {
    return null;
  }
}

function setCachedPaperRows(rows: PaperRow[]) {
  paperRowsCache = rows;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PAPER_ROWS_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Ignore storage quota/privacy-mode failures; in-memory cache still works.
  }
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

async function downloadAsFile(url: string, name: string, type = "application/pdf"): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载文件失败 ${res.status}`);
  const blob = await res.blob();
  return new File([blob], name, { type });
}

function triggerBrowserDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function QuestionBankPage() {
  const cachedRows = getCachedPaperRows();
  const [papers, setPapers] = useState<PaperRow[]>(cachedRows ?? []);
  const [loading, setLoading] = useState(cachedRows === null);

  // upload-only dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [year, setYear] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");

  // extract dialog / preview state
  const [extractTarget, setExtractTarget] = useState<PaperRow | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [extractError, setExtractError] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedQuestion[]>([]);
  const [savingPreview, setSavingPreview] = useState(false);

  // per-row busy state for download
  const [downloadingId, setDownloadingId] = useState<string>("");

  const load = async (showLoading = paperRowsCache === null) => {
    if (showLoading) setLoading(true);
    try {
      if (!paperRowsRequest) {
        paperRowsRequest = (async () => {
          const { data, error } = await supabase
            .from("math_papers")
            .select("id, year, name, question_count, created_at")
            .order("year", { ascending: false })
            .order("created_at", { ascending: false });
          if (error) throw error;
          return (data ?? []) as PaperRow[];
        })().finally(() => {
          paperRowsRequest = null;
        });
      }
      const request = paperRowsRequest;
      if (!request) return;
      const rows = await request;
      setCachedPaperRows(rows);
      setPapers(rows);
    } catch (error) {
      console.error("load math papers failed", error);
      toast.error("加载试卷列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(paperRowsCache === null);
  }, []);

  const onPaperFile = (f: File | null) => {
    setPaperFile(f);
    if (f) {
      const y = extractYearFromFilename(f.name);
      if (y) setYear(String(y));
      if (!name) setName(f.name.replace(/\.pdf$/i, ""));
    }
  };

  // 仅上传 PDF 原件并创建试卷记录
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paperFile) return toast.error("请上传试卷 PDF");
    const yNum = Number(year);
    if (!yNum || yNum < 1900 || yNum > 2100) return toast.error("请填写有效年份");
    if (!name.trim()) return toast.error("请填写试卷名称");

    setUploading(true);
    setUploadError("");
    try {
      const ts = Date.now();
      const pPath = `${yNum}/${ts}-paper.pdf`;
      const { error: e1 } = await supabase.storage
        .from("math-papers")
        .upload(pPath, paperFile, { contentType: "application/pdf", upsert: false });
      if (e1) throw new Error("上传试卷失败：" + e1.message);

      let aPath: string | null = null;
      if (answerFile) {
        aPath = `${yNum}/${ts}-answer.pdf`;
        const { error: e2 } = await supabase.storage
          .from("math-papers")
          .upload(aPath, answerFile, { contentType: "application/pdf", upsert: false });
        if (e2) throw new Error("上传答案失败：" + e2.message);
      }

      await createMathPaper({
        data: {
          year: yNum,
          name: name.trim(),
          pdfPath: pPath,
          answerPdfPath: aPath,
        },
      });

      toast.success("试卷原件已存档。可在列表中点「抽取题目」生成题库。");
      setUploadOpen(false);
      setPaperFile(null);
      setAnswerFile(null);
      setYear("");
      setName("");
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传失败";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  // 抽题流程：从 storage 拉回 PDF → 渲染 → 调 AI → 裁剪 → 进入预览
  const handleExtract = async (paper: PaperRow) => {
    setExtractTarget(paper);
    setExtracting(true);
    setExtractError("");
    setStage("准备文件...");
    try {
      const urls = await getMathPaperPdfUrls({ data: { paperId: paper.id } });
      if (!urls.pdfUrl) throw new Error("试卷 PDF 不存在");
      setStage("下载试卷 PDF...");
      const paperPdfFile = await downloadAsFile(urls.pdfUrl, "paper.pdf");
      const answerPdfFile = urls.answerPdfUrl
        ? await (async () => {
            setStage("下载答案 PDF...");
            return downloadAsFile(urls.answerPdfUrl!, "answer.pdf");
          })()
        : null;

      setStage("渲染试卷页面...");
      const paperPages = await renderPdfPages(paperPdfFile, 1.15, 0.68);
      let answerPages: RenderedPage[] = [];
      if (answerPdfFile) {
        setStage("渲染答案页面...");
        answerPages = await renderPdfPages(answerPdfFile, 1.05, 0.68);
      }

      const imagePrefix = `${paper.year}/${paper.id}-pages`;
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
        setStage(
          `AI 抽取第 ${questionStart}-${questionEnd} 题（${batchIndex + 1}/${QUESTION_BATCHES.length}）...`,
        );
        const result = await extractPaperQuestions({
          data: { paperPageImages, answerPageImages, questionStart, questionEnd },
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
            page_index: Number.isInteger(Number(q.page_index)) ? Number(q.page_index) : 0,
            stem_bbox: q.stem_bbox ?? null,
            options_bbox: q.options_bbox ?? null,
          });
        }
      }
      const qs = Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
      if (!qs?.length) throw new Error("AI 未抽取到题目");
      if (qs.length < 25) toast.warning(`只抽取到 ${qs.length} 道题，请在预览中检查`);

      setStage("裁剪题目与选项截图...");
      const byPage = new Map<number, ExtractedQuestion[]>();
      for (const q of qs) {
        if (!paperPages[q.page_index]) continue;
        if (!q.stem_bbox && !q.options_bbox) continue;
        byPage.set(q.page_index, [...(byPage.get(q.page_index) ?? []), q]);
      }
      for (const [pageIndex, pageQuestions] of byPage) {
        setStage(`裁剪第 ${pageIndex + 1} 页（${pageQuestions.length} 题）...`);
        const canvas = await renderPdfPageCanvas(paperPdfFile, pageIndex, 1.15);
        try {
          for (const q of pageQuestions) {
            if (q.stem_bbox) {
              try {
                const blob = await cropCanvasToBlob(canvas, q.stem_bbox);
                q.stemImageBlob = blob;
                q.stemImageDataUrl = URL.createObjectURL(blob);
              } catch (err) {
                console.error("crop stem failed", q.number, err);
              }
            }
            if (q.options_bbox) {
              try {
                const blob = await cropCanvasToBlob(canvas, q.options_bbox);
                q.optionsImageBlob = blob;
                q.optionsImageDataUrl = URL.createObjectURL(blob);
              } catch (err) {
                console.error("crop options failed", q.number, err);
              }
            }
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }

      setExtracted(qs);
      setPreviewOpen(true);
      toast.success(`已抽取 ${qs.length} 道题，请确认后入库`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "处理失败";
      setExtractError(message);
      toast.error(message);
    } finally {
      setExtracting(false);
      setStage("");
    }
  };

  const handleSavePreview = async () => {
    if (!extractTarget) return;
    setSavingPreview(true);
    try {
      const ts = Date.now();
      type WithPaths = ExtractedQuestion & { image_path?: string; options_image_path?: string };
      for (const q of extracted as WithPaths[]) {
        const base = `${extractTarget.year}/${extractTarget.id}/${ts}/q${String(q.number).padStart(2, "0")}`;
        if (q.stemImageBlob) {
          const path = `${base}-stem.png`;
          const { error } = await supabase.storage
            .from("math-question-images")
            .upload(path, q.stemImageBlob, { contentType: "image/png", upsert: true });
          if (error) console.error("upload stem failed", q.number, error);
          else q.image_path = path;
        }
        if (q.optionsImageBlob) {
          const path = `${base}-options.png`;
          const { error } = await supabase.storage
            .from("math-question-images")
            .upload(path, q.optionsImageBlob, { contentType: "image/png", upsert: true });
          if (error) console.error("upload options failed", q.number, error);
          else q.options_image_path = path;
        }
      }

      const payload = (extracted as WithPaths[]).map((q) => ({
        number: q.number,
        stem: q.stem,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        option_e: q.option_e,
        correct_answer: q.correct_answer,
        image_path: q.image_path ?? null,
        options_image_path: q.options_image_path ?? null,
      }));

      await replaceMathPaperQuestions({
        data: { paperId: extractTarget.id, questions: payload },
      });
      toast.success("已入库");
      setPreviewOpen(false);
      setExtracted([]);
      setExtractTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingPreview(false);
    }
  };

  const handleDownload = async (paper: PaperRow, kind: "paper" | "answer") => {
    setDownloadingId(paper.id + ":" + kind);
    try {
      const urls = await getMathPaperPdfUrls({ data: { paperId: paper.id } });
      const url = kind === "paper" ? urls.pdfUrl : urls.answerPdfUrl;
      if (!url) {
        toast.error(kind === "paper" ? "未找到试卷文件" : "未上传答案文件");
        return;
      }
      const suffix = kind === "paper" ? "试卷" : "答案";
      triggerBrowserDownload(url, `${paper.year}-${paper.name}-${suffix}.pdf`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "下载失败");
    } finally {
      setDownloadingId("");
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
              上传试卷 PDF
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>上传试卷原件</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                仅存档 PDF 原文件，不会立即抽题。上传后可在列表中随时点「抽取题目」或「下载」。
              </p>
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
              {uploading && (
                <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  上传中...
                </div>
              )}
              {uploadError && !uploading && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {uploadError}
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "上传中..." : "保存原件"}
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
          还没有任何试卷。点击右上角「上传试卷 PDF」开始。
        </div>
      ) : (
        <div className="space-y-2">
          {papers.map((p) => {
            const isExtractingThis = extracting && extractTarget?.id === p.id;
            return (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  to="/admin/question-bank/$paperId"
                  params={{ paperId: p.id }}
                  className="flex-1 min-w-0"
                >
                  <div className="font-medium">
                    {p.year} · {p.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.question_count > 0 ? (
                      <span>{p.question_count} 道题</span>
                    ) : (
                      <span className="text-amber-600">未抽题</span>
                    )}
                    <span> · 上传于 {new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  {isExtractingThis && stage && (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {stage}
                    </div>
                  )}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleDownload(p, "paper")}
                    disabled={downloadingId === p.id + ":paper"}
                  >
                    <FileText className="h-3.5 w-3.5" /> 试卷
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleDownload(p, "answer")}
                    disabled={downloadingId === p.id + ":answer"}
                  >
                    <Download className="h-3.5 w-3.5" /> 答案
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleExtract(p)}
                    disabled={extracting}
                  >
                    {isExtractingThis ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {p.question_count > 0 ? "重新抽题" : "抽取题目"}
                  </Button>
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
                        <AlertDialogDescription>
                          该试卷及其全部题目都会被删除。
                        </AlertDialogDescription>
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
              </div>
            );
          })}
        </div>
      )}

      {extractError && !extracting && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          抽题失败：{extractError}
        </div>
      )}

      <Dialog
        open={previewOpen}
        onOpenChange={(v) => {
          setPreviewOpen(v);
          if (!v) setExtractTarget(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              预览 · {extractTarget?.year} {extractTarget?.name}（{extracted.length} 题）
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
          {q.stemImageDataUrl && (
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
              <ImageIcon className="h-3 w-3" /> 题干图
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
      {q.stemImageDataUrl && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            题干截图
          </div>
          <img
            src={q.stemImageDataUrl}
            alt={`第 ${q.number} 题题干`}
            className="max-h-64 rounded border"
          />
        </div>
      )}
      {q.optionsImageDataUrl && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            选项截图
          </div>
          <img
            src={q.optionsImageDataUrl}
            alt={`第 ${q.number} 题选项`}
            className="max-h-48 rounded border"
          />
        </div>
      )}
    </div>
  );
}
