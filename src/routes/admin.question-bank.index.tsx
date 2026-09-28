import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  FolderPlus,
  Folder,
  ChevronRight,
  Crop,
  Zap,
  Shield,
  FileSpreadsheet,
} from "lucide-react";
import { FolderPermissionsDialog } from "@/components/folder-permissions-dialog";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/math-text";

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
  replaceMathPaperQuestions,
  getMathPaperPdfUrls,
  deleteMathPaper,
  bulkUpdateQuestionAnswers,
  importCalcQuestions,
} from "@/lib/math-papers.functions";
import {
  listMathPaperFolders,
  createMathPaperFolder,
  deleteMathPaperFolder,
  createMathPaperFiles,
  listMathPapersInFolder,
} from "@/lib/math-paper-folders.functions";
import {
  renderPdfPages,
  renderPdfPageCanvas,
  cropCanvasToBlob,
  getPdfTextItems,
  type RenderedPage,
  type PdfPageText,
} from "@/lib/pdf-render";

const SearchSchema = z.object({
  folder: fallback(z.string().uuid().nullable(), null).default(null),
});

export const Route = createFileRoute("/admin/question-bank/")({
  validateSearch: zodValidator(SearchSchema),
  component: QuestionBankPage,
});

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

interface PaperRow {
  id: string;
  year: number | null;
  name: string;
  question_count: number;
  created_at: string;
  kind: "paper" | "answer";
  folder_id: string | null;
}

type Bbox = { x: number; y: number; w: number; h: number } | null;
type Region = { page: number; bbox: NonNullable<Bbox> };

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
  stem_page_index: number;
  options_page_index: number;
  stem_bbox: Bbox;
  options_bbox: Bbox;
  stem_render_mode: "text" | "image";
  options_render_mode: "text" | "image";
  stemImageBlob?: Blob | null;
  stemImageDataUrl?: string | null;
  optionsImageBlob?: Blob | null;
  optionsImageDataUrl?: string | null;
  regions?: Region[];
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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/question-bank/" });
  const currentFolderId = search.folder;

  const [allFolders, setAllFolders] = useState<FolderRow[]>([]);
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [loading, setLoading] = useState(true);

  // create folder
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // batch upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<"paper" | "answer">("paper");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");

  // extract / preview
  const [extractTarget, setExtractTarget] = useState<PaperRow | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [extractError, setExtractError] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedQuestion[]>([]);
  const [pageImages, setPageImages] = useState<Map<number, string>>(new Map());
  const [paperPdfFile, setPaperPdfFile] = useState<File | null>(null);
  const [totalPdfPages, setTotalPdfPages] = useState(0);
  const [savingPreview, setSavingPreview] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string>("");

  // bulk sync answers from 简版答案
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");

  // 批量导入计算题
  type CalcRow = { stem: string; answer: string; tags: string[] };
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcName, setCalcName] = useState("计算题集");
  const [calcText, setCalcText] = useState("");
  const [calcRows, setCalcRows] = useState<CalcRow[]>([]);
  const [calcImporting, setCalcImporting] = useState(false);
  const calcFileRef = useRef<HTMLInputElement | null>(null);

  const parseCalcLines = (text: string): CalcRow[] => {
    const rows: CalcRow[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\||｜|\t/).map((s) => s.trim());
      const stem = parts[0] ?? "";
      if (!stem || stem === "题干" || stem === "题目") continue;
      rows.push({
        stem,
        answer: parts[1] ?? "",
        tags: (parts[2] ?? "")
          .split(/[,，、;；]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
    return rows;
  };

  const handleCalcTextChange = (text: string) => {
    setCalcText(text);
    setCalcRows(parseCalcLines(text));
  };

  const handleCalcFile = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: "",
      });
      const lines = grid
        .map((r) => r.map((c) => String(c ?? "").trim()).join("|"))
        .join("\n");
      setCalcText(lines);
      setCalcRows(parseCalcLines(lines));
      toast.success(`已读取 ${file.name}`);
    } catch (err) {
      toast.error("文件读取失败：" + (err instanceof Error ? err.message : ""));
    }
  };

  const handleCalcImport = async () => {
    if (!calcName.trim()) return toast.error("请填写题集名称");
    if (calcRows.length === 0) return toast.error("没有可导入的题目");
    setCalcImporting(true);
    try {
      const { count } = await importCalcQuestions({
        data: {
          folderId: currentFolderId,
          name: calcName.trim(),
          questions: calcRows.map((r) => ({
            stem: r.stem,
            answer: r.answer || null,
            tags: r.tags,
          })),
        },
      });
      toast.success(`已导入 ${count} 道题到「${calcName.trim()}」`);
      setCalcOpen(false);
      setCalcText("");
      setCalcRows([]);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setCalcImporting(false);
    }
  };



  const subfolders = useMemo(
    () => allFolders.filter((f) => f.parent_id === currentFolderId),
    [allFolders, currentFolderId],
  );

  const folderById = useMemo(() => {
    const m = new Map<string, FolderRow>();
    for (const f of allFolders) m.set(f.id, f);
    return m;
  }, [allFolders]);

  const breadcrumb = useMemo(() => {
    const chain: FolderRow[] = [];
    let id = currentFolderId;
    while (id) {
      const f = folderById.get(id);
      if (!f) break;
      chain.unshift(f);
      id = f.parent_id;
    }
    return chain;
  }, [currentFolderId, folderById]);

  // 当前位置可同步答案的条件：找到一对（题目文件夹 + 简版答案文件夹）位于同一父级
  const syncPair = useMemo(() => {
    // 1) 当前文件夹下同时存在两个子文件夹
    const paperSub = subfolders.find((f) => f.name.trim() === "题目");
    const keySub = subfolders.find((f) => f.name.trim() === "简版答案");
    if (paperSub && keySub) return { paperFolderId: paperSub.id, keyFolderId: keySub.id };
    // 2) 当前就是「题目」，找同级「简版答案」
    const cur = currentFolderId ? folderById.get(currentFolderId) : null;
    if (cur && cur.name.trim() === "题目") {
      const sibling = allFolders.find(
        (f) => f.parent_id === cur.parent_id && f.name.trim() === "简版答案",
      );
      if (sibling) return { paperFolderId: cur.id, keyFolderId: sibling.id };
    }
    return null;
  }, [subfolders, currentFolderId, folderById, allFolders]);



  const load = async () => {
    setLoading(true);
    try {
      const [{ folders }, { papers: ps }] = await Promise.all([
        listMathPaperFolders(),
        listMathPapersInFolder({ data: { folderId: currentFolderId } }),
      ]);
      setAllFolders(folders as FolderRow[]);
      setPapers(ps as PaperRow[]);
    } catch (err) {
      console.error(err);
      toast.error("加载题库失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createMathPaperFolder({
        data: { name: newFolderName.trim(), parentId: currentFolderId },
      });
      toast.success("文件夹已创建");
      setFolderDialogOpen(false);
      setNewFolderName("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteMathPaperFolder({ data: { id } });
      toast.success("文件夹已删除（其中文件已移至上层）");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const openUpload = (kind: "paper" | "answer") => {
    setUploadKind(kind);
    setUploadFiles([]);
    setUploadError("");
    setUploadOpen(true);
  };

  const handleBatchUpload = async () => {
    if (uploadFiles.length === 0) return toast.error("请选择 PDF 文件");
    setUploading(true);
    setUploadError("");
    try {
      const ts = Date.now();
      const files: { name: string; pdfPath: string; year: number | null }[] = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress(`上传中 ${i + 1}/${uploadFiles.length}：${file.name}`);
        const year = extractYearFromFilename(file.name);
        const folderSeg = currentFolderId ?? "root";
        const path = `${folderSeg}/${ts}-${i}-${uploadKind}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage
          .from("math-papers")
          .upload(path, file, { contentType: "application/pdf", upsert: false });
        if (error) throw new Error(`上传 ${file.name} 失败：${error.message}`);
        files.push({
          name: file.name.replace(/\.pdf$/i, ""),
          pdfPath: path,
          year,
        });
      }
      setUploadProgress("写入题库...");
      await createMathPaperFiles({
        data: { folderId: currentFolderId, kind: uploadKind, files },
      });
      toast.success(`已上传 ${files.length} 个文件`);
      setUploadOpen(false);
      setUploadFiles([]);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传失败";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

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

      setStage("渲染试卷页面...");
      const paperPages = await renderPdfPages(paperPdfFile, 1.15, 0.68);
      setPaperPdfFile(paperPdfFile);
      setTotalPdfPages(paperPages.length);

      const imagePrefix = `${paper.year ?? "n"}/${paper.id}-pages`;
      const { signedUrls: paperPageImages } = await uploadRenderedPageImages(
        paperPages,
        imagePrefix,
        "试卷",
        setStage,
      );

      const byNumber = new Map<number, ExtractedQuestion>();
      for (const [batchIndex, [questionStart, questionEnd]] of QUESTION_BATCHES.entries()) {
        setStage(
          `AI 抽取第 ${questionStart}-${questionEnd} 题（${batchIndex + 1}/${QUESTION_BATCHES.length}）...`,
        );
        const result = await extractPaperQuestions({
          data: {
            paperPageImages,
            answerPageImages: [],
            questionStart,
            questionEnd,
          },
        });
        for (const raw of result.questions ?? []) {
          const q = raw as ExtractedQuestion;
          const number = Number(q.number);
          if (!Number.isInteger(number) || number < questionStart || number > questionEnd) continue;
          const pageIdx = Number.isInteger(Number(q.page_index)) ? Number(q.page_index) : 0;
          const stemPage = Number.isInteger(Number(q.stem_page_index))
            ? Number(q.stem_page_index)
            : pageIdx;
          const optsPage = Number.isInteger(Number(q.options_page_index))
            ? Number(q.options_page_index)
            : pageIdx;
          const clampPage = (p: number) =>
            Math.max(0, Math.min(paperPages.length - 1, p));
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
            page_index: clampPage(pageIdx),
            stem_page_index: clampPage(stemPage),
            options_page_index: clampPage(optsPage),
            stem_bbox: q.stem_bbox ?? null,
            options_bbox: q.options_bbox ?? null,
            stem_render_mode: q.stem_render_mode === "image" ? "image" : "text",
            options_render_mode: q.options_render_mode === "image" ? "image" : "text",
          });
        }
      }
      const qs = Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
      if (!qs?.length) throw new Error("AI 未抽取到题目");
      if (qs.length < 25) toast.warning(`只抽取到 ${qs.length} 道题，请在预览中检查`);

      setStage("解析 PDF 文本锚点...");
      // 锚点优先级：
      //   1) "Problem N" / "Problem N."  —— 主要锚点，作为题干图片的左上角
      //   2) 题干正文文本匹配（AI 抽取的 stem 在 PDF 文本层中的位置）
      //   3) "N." 题号
      //   4) AI bbox
      // 截图底部：只能由 (A)~(E) 选项文本决定，不能用页码/页脚作为下边界
      let pageTexts: PdfPageText[] = [];
      try {
        pageTexts = await getPdfTextItems(paperPdfFile);
      } catch (err) {
        console.warn("PDF 文本锚点解析失败，回退到 AI bbox", err);
      }

      // 每页阅读顺序拼接的归一化文本流（用于按文字内容查找 stem）
      const normalizeText = (s: string) =>
        s
          .replace(/\$[^$]*\$/g, " ")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      const isFooterPageNumber = (it: { str: string; x: number; y: number; w: number }) => {
        const text = it.str.trim();
        const centerX = it.x + it.w / 2;
        return /^-?\s*\d{1,3}\s*-?$/.test(text) && it.y > 0.88 && centerX > 0.35 && centerX < 0.65;
      };
      const getPageContentBottom = (pageIndex: number, fromY: number, beforeY = 1) => {
        const items = (pageTexts[pageIndex]?.items ?? []).filter(
          (it) => it.y + it.h > fromY && it.y < beforeY && !isFooterPageNumber(it),
        );
        return items.length ? items.reduce((m, it) => Math.max(m, it.y + it.h), fromY) : null;
      };
      type PageStream = { pageIndex: number; norm: string; ys: number[] };
      const pageStreams: PageStream[] = pageTexts.map((p) => {
        const sorted = [...p.items].sort((a, b) => {
          const dy = Math.round(a.y * 200) - Math.round(b.y * 200);
          return dy !== 0 ? dy : a.x - b.x;
        });
        let norm = "";
        const ys: number[] = [];
        for (const it of sorted) {
          for (const ch of it.str) {
            const c = ch.toLowerCase();
            if (/[a-z0-9]/.test(c)) {
              norm += c;
              ys.push(it.y);
            }
          }
        }
        return { pageIndex: p.pageIndex, norm, ys };
      });

      type Hit = { page: number; pos: number; y: number };
      const findText = (
        needle: string,
        fromPage: number,
        fromPos: number,
      ): Hit | null => {
        if (!needle || needle.length < 6) return null;
        for (const ps of pageStreams) {
          if (ps.pageIndex < fromPage) continue;
          const start = ps.pageIndex === fromPage ? fromPos : 0;
          const idx = ps.norm.indexOf(needle, start);
          if (idx >= 0) return { page: ps.pageIndex, pos: idx, y: ps.ys[idx] };
        }
        return null;
      };

      // 1) Problem 锚点检测
      //    匹配单一文本项 "Problem 1" / "Problem 1." 以及跨项 "Problem"+"1" / "Problem"+"1."
      type ProblemAnchor = { num: number; page: number; y: number; x: number };
      const problemAnchorsAll: ProblemAnchor[] = [];
      for (const pt of pageTexts) {
        const items = [...pt.items].sort((a, b) => {
          const dy = Math.round(a.y * 200) - Math.round(b.y * 200);
          return dy !== 0 ? dy : a.x - b.x;
        });
        for (let i = 0; i < items.length; i++) {
          const cur = items[i];
          const text = cur.str.trim();
          // 整体匹配
          const m1 = text.match(/^Problem\s+(\d{1,2})\.?$/i);
          if (m1) {
            const n = Number(m1[1]);
            if (n >= 1 && n <= 25)
              problemAnchorsAll.push({ num: n, page: pt.pageIndex, y: cur.y, x: cur.x });
            continue;
          }
          // 拆分匹配：当前项以 "Problem" 开头，下一项是数字
          if (/^Problem$/i.test(text) || /Problem\s*$/i.test(text)) {
            const nxt = items[i + 1];
            if (nxt && Math.abs(nxt.y - cur.y) < 0.012) {
              const m2 = nxt.str.trim().match(/^(\d{1,2})\.?$/);
              if (m2) {
                const n = Number(m2[1]);
                if (n >= 1 && n <= 25)
                  problemAnchorsAll.push({ num: n, page: pt.pageIndex, y: cur.y, x: cur.x });
              }
            }
          }
        }
      }

      // 2) 题号 "N." 锚点（辅助）
      type NumAnchor = { num: number; page: number; y: number; x: number };
      const numAnchorsAll: NumAnchor[] = [];
      for (const pt of pageTexts) {
        for (const it of pt.items) {
          const m = it.str.trim().match(/^(\d{1,2})\.$/);
          if (m && it.x < 0.5 && !isFooterPageNumber(it)) {
            const n = Number(m[1]);
            if (n >= 1 && n <= 25)
              numAnchorsAll.push({ num: n, page: pt.pageIndex, y: it.y, x: it.x });
          }
        }
      }

      // 为每题定位 stem 起点
      type StemLoc = { page: number; y: number; x: number };
      const stemLocByNum = new Map<number, StemLoc>();
      const sortedQs = [...qs].sort((a, b) => a.number - b.number);
      let cursorPage = 0;
      let cursorY = -1;

      const afterCursor = (page: number, y: number) =>
        page > cursorPage || (page === cursorPage && y > cursorY - 0.005);

      for (const q of sortedQs) {
        // (1) Problem N 锚点
        const problemHits = problemAnchorsAll
          .filter((a) => a.num === q.number && afterCursor(a.page, a.y))
          .sort((a, b) => a.page - b.page || a.y - b.y);
        if (problemHits.length) {
          const best = problemHits[0];
          stemLocByNum.set(q.number, { page: best.page, y: best.y, x: best.x });
          cursorPage = best.page;
          cursorY = best.y;
          continue;
        }
        // (2) 题干文本匹配
        const fullNorm = normalizeText(q.stem ?? "");
        let hit: Hit | null = null;
        const startPos =
          cursorY < 0
            ? 0
            : Math.max(
                0,
                (pageStreams[cursorPage]?.ys.findIndex((y) => y > cursorY + 0.002) ?? -1) + 0,
              );
        for (const len of [40, 30, 20, 14, 10, 8]) {
          if (fullNorm.length < len) continue;
          hit = findText(
            fullNorm.slice(0, len),
            cursorPage,
            hit ? 0 : startPos,
          );
          if (hit) break;
        }
        if (hit) {
          stemLocByNum.set(q.number, { page: hit.page, y: hit.y, x: 0.08 });
          cursorPage = hit.page;
          cursorY = hit.y;
          continue;
        }
        // (3) "N." 数字锚点
        const numCandidates = numAnchorsAll.filter(
          (a) => a.num === q.number && afterCursor(a.page, a.y),
        );
        if (numCandidates.length) {
          const aiPage = q.stem_page_index ?? q.page_index ?? 0;
          const aiY = q.stem_bbox?.y ?? 0.5;
          const best = numCandidates.reduce((b, c) =>
            Math.abs(c.page - aiPage) * 10 + Math.abs(c.y - aiY) <
            Math.abs(b.page - aiPage) * 10 + Math.abs(b.y - aiY)
              ? c
              : b,
          );
          stemLocByNum.set(q.number, { page: best.page, y: best.y, x: best.x });
          cursorPage = best.page;
          cursorY = best.y;
        }
      }

      // 应用锚点 → 合并题干+选项为单张截图
      // 顶部：Problem N 行；左右：页边距 ~2cm（Letter 612pt → 56.7pt ≈ 0.0926）；
      // 底部：(A)~(E) 选项行最底部 + 一行余量
      const MARGIN_X = 0.085;
      const MARGIN_W = 1 - MARGIN_X * 2;
      // 每题对应的待截区域（可能跨页，需要后续纵向拼接）
      // Region type declared at module scope
      const regionsByQ = new Map<number, Region[]>();

      for (const q of qs) {
        const loc = stemLocByNum.get(q.number);
        if (!loc) {
          // 回退到 AI bbox（极少触发）
          if (q.stem_bbox) {
            regionsByQ.set(q.number, [{ page: q.stem_page_index, bbox: { ...q.stem_bbox } }]);
          }
          continue;
        }
        const next = stemLocByNum.get(q.number + 1) ?? null;
        const stemTop = Math.max(0, loc.y - 0.006);

        const markerRe = /^\([A-E]\)/;
        const optionMarkerRank = (it: { str: string }) => {
          const m = it.str.trim().match(/^\(([A-E])\)/);
          return m ? m[1].charCodeAt(0) - 65 : -1;
        };
        const getOptionBottom = (items: { str: string; y: number; h: number }[]) => {
          const byLetter = new Map<number, { str: string; y: number; h: number }>();
          for (const item of items) {
            const rank = optionMarkerRank(item);
            if (rank < 0) continue;
            const existing = byLetter.get(rank);
            if (!existing || item.y > existing.y) byLetter.set(rank, item);
          }
          const lastOption = byLetter.get(4) ?? byLetter.get(Math.max(...byLetter.keys()));
          return lastOption ? lastOption.y + lastOption.h : null;
        };

        // 在 stem 页面收集 loc 之后所有 (A)~(E) 行；排除页码/页脚，截图下边界只跟选项位置有关
        const optMarkers = (pageTexts[loc.page]?.items ?? []).filter(
          (it) => markerRe.test(it.str.trim()) && it.y > loc.y + 0.005 && !isFooterPageNumber(it),
        );
        // 同页下一题之前
        const optMarkersBeforeNext = optMarkers.filter(
          (it) => !next || next.page > loc.page || it.y < next.y,
        );

        const optionBottom = getOptionBottom(optMarkersBeforeNext);
        if (optionBottom !== null) {
          // 选项在同页：bottom = 最后一个选项文本底部；页码永远不能作为 bottom 的依据
          const bottom = optionBottom;
          regionsByQ.set(q.number, [
            {
              page: loc.page,
              bbox: {
                x: MARGIN_X,
                y: stemTop,
                w: MARGIN_W,
                h: Math.max(0.02, bottom - stemTop),
              },
            },
          ]);
          q.stem_page_index = loc.page;
          q.options_page_index = loc.page;
          q.stem_bbox = {
            x: MARGIN_X,
            y: stemTop,
            w: MARGIN_W,
            h: Math.max(0.02, bottom - stemTop),
          };
          q.options_bbox = null;
        } else if (next && next.page > loc.page) {
          // 跨页：题干在 loc.page，选项在 next.page
          const nextPageOpts = (pageTexts[next.page]?.items ?? []).filter(
            (it) => markerRe.test(it.str.trim()) && it.y < next.y - 0.005 && !isFooterPageNumber(it),
          );
          const regions: Region[] = [
            {
              page: loc.page,
              bbox: {
                x: MARGIN_X,
                y: stemTop,
                w: MARGIN_W,
                h: Math.max(0.02, (getPageContentBottom(loc.page, stemTop) ?? 0.995) - stemTop),
              },
            },
          ];
          const nextOptionBottom = getOptionBottom(nextPageOpts);
          if (nextOptionBottom !== null) {
            const topY = Math.max(0, nextPageOpts[0].y - 0.006);
            const bottomY = nextOptionBottom;
            regions.push({
              page: next.page,
              bbox: {
                x: MARGIN_X,
                y: topY,
                w: MARGIN_W,
                h: Math.max(0.02, bottomY - topY),
              },
            });
          }
          regionsByQ.set(q.number, regions);
          q.stem_page_index = loc.page;
          q.options_page_index = regions.length > 1 ? next.page : loc.page;
          q.stem_bbox = regions[0].bbox;
          q.options_bbox = regions[1]?.bbox ?? null;
        } else {
          // 无选项标记：取到下题之前；若没有下题，仅取到正文最后一行，明确排除页脚页码
          const bottom = next && next.page === loc.page
            ? next.y - 0.006
            : (getPageContentBottom(loc.page, stemTop) ?? 0.995);
          const bbox = {
            x: MARGIN_X,
            y: stemTop,
            w: MARGIN_W,
            h: Math.max(0.02, bottom - stemTop),
          };
          regionsByQ.set(q.number, [{ page: loc.page, bbox }]);
          q.stem_page_index = loc.page;
          q.options_page_index = loc.page;
          q.stem_bbox = bbox;
          q.options_bbox = null;
        }
      }

      setStage("裁剪题目截图...");
      // 按页聚合，逐页渲染一次 canvas
      const pagesNeeded = new Set<number>();
      for (const regions of regionsByQ.values()) {
        for (const r of regions) pagesNeeded.add(r.page);
      }
      const pageCanvases = new Map<number, HTMLCanvasElement>();
      for (const p of pagesNeeded) {
        setStage(`渲染第 ${p + 1} 页...`);
        pageCanvases.set(p, await renderPdfPageCanvas(paperPdfFile, p, 2.5));
      }

      const stitchCrops = async (crops: HTMLCanvasElement[]): Promise<Blob> => {
        if (crops.length === 1) {
          return new Promise<Blob>((resolve, reject) =>
            crops[0].toBlob(
              (b) => (b ? resolve(b) : reject(new Error("生成失败"))),
              "image/png",
            ),
          );
        }
        const w = Math.max(...crops.map((c) => c.width));
        const totalH = crops.reduce((s, c) => s + c.height, 0);
        const out = document.createElement("canvas");
        out.width = w;
        out.height = totalH;
        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("canvas 上下文创建失败");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, totalH);
        let y = 0;
        for (const c of crops) {
          ctx.drawImage(c, 0, y);
          y += c.height;
        }
        return new Promise<Blob>((resolve, reject) =>
          out.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("生成失败"))),
            "image/png",
          ),
        );
      };

      const cropToCanvas = (
        canvas: HTMLCanvasElement,
        bbox: { x: number; y: number; w: number; h: number },
        padding = 0.003,
      ) => {
        const x = Math.max(0, (bbox.x - padding) * canvas.width);
        const y = Math.max(0, (bbox.y - padding) * canvas.height);
        const w = Math.min(canvas.width - x, (bbox.w + padding * 2) * canvas.width);
        const h = Math.min(canvas.height - y, (bbox.h + padding * 2) * canvas.height);
        const out = document.createElement("canvas");
        out.width = Math.ceil(w);
        out.height = Math.ceil(h);
        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("canvas 上下文创建失败");
        ctx.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
        return out;
      };

      for (const q of qs) {
        const regions = regionsByQ.get(q.number);
        if (!regions || regions.length === 0) continue;
        q.regions = regions.map((r) => ({ page: r.page, bbox: { ...r.bbox } }));
        try {
          const crops: HTMLCanvasElement[] = [];
          for (const r of regions) {
            const canvas = pageCanvases.get(r.page);
            if (!canvas) continue;
            crops.push(cropToCanvas(canvas, r.bbox, 0.003));
          }
          if (crops.length === 0) continue;
          const blob = await stitchCrops(crops);
          q.stemImageBlob = blob;
          q.stemImageDataUrl = URL.createObjectURL(blob);
          q.optionsImageBlob = null;
          q.optionsImageDataUrl = null;
        } catch (err) {
          console.error("crop failed", q.number, err);
        }
      }

      // 保留各页全分辨率图像（dataURL），用于人工调整截图时再次裁剪
      const pageImagesMap = new Map<number, string>();
      for (const [p, canvas] of pageCanvases.entries()) {
        try {
          pageImagesMap.set(p, canvas.toDataURL("image/jpeg", 0.85));
        } catch (err) {
          console.warn("toDataURL failed", p, err);
        }
      }
      setPageImages(pageImagesMap);

      // 释放 canvas
      for (const c of pageCanvases.values()) {
        c.width = 0;
        c.height = 0;
      }

      // ===== 校对：在合并区域内核对 PDF 文字是否包含 AI 提取的题干前缀 =====
      setStage("校对截图与文字...");
      const mismatched: number[] = [];
      for (const q of qs) {
        const regions = regionsByQ.get(q.number);
        if (!regions || regions.length === 0) continue;
        const aiNorm = normalizeText(q.stem ?? "");
        if (aiNorm.length < 8) continue;
        const collected: string[] = [];
        for (const r of regions) {
          const pageItems = pageTexts[r.page]?.items ?? [];
          const bx = r.bbox.x;
          const by = r.bbox.y;
          const bxe = bx + r.bbox.w;
          const bye = by + r.bbox.h;
          const inRegion = pageItems
            .filter(
              (it) =>
                it.y + it.h > by - 0.005 &&
                it.y < bye + 0.005 &&
                it.x + it.w > bx - 0.02 &&
                it.x < bxe + 0.02,
            )
            .sort((a, b) => {
              const dy = Math.round(a.y * 200) - Math.round(b.y * 200);
              return dy !== 0 ? dy : a.x - b.x;
            });
          collected.push(inRegion.map((it) => it.str).join(" "));
        }
        const cropNorm = normalizeText(collected.join(" "));
        const keyLen = Math.min(20, Math.max(10, Math.floor(aiNorm.length * 0.4)));
        const key = aiNorm.slice(0, keyLen);
        // 同时校对：选项 (A)~(E) 全部应出现
        const hasAllOpts = ["(A)", "(B)", "(C)", "(D)", "(E)"].every((tag) =>
          collected.join(" ").includes(tag),
        );
        const ok = cropNorm.includes(key) && hasAllOpts;
        if (!ok) {
          mismatched.push(q.number);
          console.warn(`[校对] 第 ${q.number} 题截图与文字/选项不一致`, {
            aiHead: aiNorm.slice(0, 40),
            cropHead: cropNorm.slice(0, 80),
            hasAllOpts,
          });
        }
      }
      if (mismatched.length) {
        toast.warning(`校对：第 ${mismatched.join(", ")} 题截图可能不完整，请预览中核对`);
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
        const base = `${extractTarget.year ?? "n"}/${extractTarget.id}/${ts}/q${String(q.number).padStart(2, "0")}`;
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
        stem_render_mode: q.stem_render_mode,
        options_render_mode: q.options_render_mode,
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

  const handleDownload = async (paper: PaperRow) => {
    setDownloadingId(paper.id);
    try {
      const urls = await getMathPaperPdfUrls({ data: { paperId: paper.id } });
      const url = urls.pdfUrl;
      if (!url) {
        toast.error("未找到文件");
        return;
      }
      const suffix = paper.kind === "paper" ? "试卷" : "答案";
      triggerBrowserDownload(url, `${paper.name}-${suffix}.pdf`);
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

  const handleSyncAnswersFromKeys = async () => {
    if (!syncPair) return;
    if (syncing) return;
    setSyncing(true);
    setSyncProgress("加载文件列表...");
    try {
      const [{ papers: paperList }, { papers: keyList }] = await Promise.all([
        listMathPapersInFolder({ data: { folderId: syncPair.paperFolderId } }),
        listMathPapersInFolder({ data: { folderId: syncPair.keyFolderId } }),
      ]);
      const paperByYear = new Map<number, PaperRow>();
      for (const p of paperList as PaperRow[]) {
        if (p.kind === "paper" && p.year) paperByYear.set(p.year, p);
      }
      const keyByYear = new Map<number, PaperRow>();
      for (const p of keyList as PaperRow[]) {
        if (p.year) keyByYear.set(p.year, p);
      }
      const matched: Array<{ year: number; paper: PaperRow; key: PaperRow }> = [];
      for (const [year, key] of keyByYear) {
        const paper = paperByYear.get(year);
        if (paper) matched.push({ year, paper, key });
      }
      matched.sort((a, b) => a.year - b.year);
      if (matched.length === 0) {
        toast.warning("没有找到可匹配的年份");
        return;
      }

      let ok = 0;
      const failures: string[] = [];
      const skipped: string[] = [];
      for (let i = 0; i < matched.length; i++) {
        const { year, paper, key } = matched[i];
        setSyncProgress(`处理 ${year}（${i + 1}/${matched.length}）...`);
        try {
          if (paper.question_count === 0) {
            skipped.push(`${year}：题目卷尚未抽题`);
            continue;
          }
          const urls = await getMathPaperPdfUrls({ data: { paperId: key.id } });
          if (!urls.pdfUrl) throw new Error("答案 PDF 链接获取失败");
          const file = await downloadAsFile(urls.pdfUrl, `key-${year}.pdf`);
          const pages = await getPdfTextItems(file);
          // 合并所有页文本，按 y、x 排序成单行
          const allItems = pages.flatMap((pg) =>
            pg.items.map((it) => ({ ...it, page: pg.pageIndex })),
          );
          allItems.sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page;
            const dy = Math.round(a.y * 200) - Math.round(b.y * 200);
            return dy !== 0 ? dy : a.x - b.x;
          });
          const text = allItems.map((it) => it.str).join(" ");
          // 匹配 "1. D" / "1 . D" / "1: D" / "1) D"
          const re = /\b(\d{1,2})\s*[\.\):]\s*([A-Ea-e])\b/g;
          const found = new Map<number, string>();
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            const n = Number(m[1]);
            const a = m[2].toUpperCase();
            if (n >= 1 && n <= 25 && !found.has(n)) found.set(n, a);
          }
          if (found.size < 20) {
            throw new Error(`仅解析到 ${found.size} 个答案，可能不是标准答案表`);
          }
          const answers = Array.from(found.entries())
            .sort(([x], [y]) => x - y)
            .map(([number, answer]) => ({ number, answer: answer as "A" | "B" | "C" | "D" | "E" }));
          await bulkUpdateQuestionAnswers({ data: { paperId: paper.id, answers } });
          ok++;
        } catch (err) {
          failures.push(`${year}：${err instanceof Error ? err.message : "未知错误"}`);
        }
      }

      const msgs = [`成功 ${ok} 份`];
      if (skipped.length) msgs.push(`跳过 ${skipped.length} 份`);
      if (failures.length) msgs.push(`失败 ${failures.length} 份`);
      toast.success(msgs.join("，"));
      if (skipped.length) console.warn("[同步答案] 跳过：", skipped);
      if (failures.length) console.error("[同步答案] 失败：", failures);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(false);
      setSyncProgress("");
    }
  };

  const goToFolder = (id: string | null) => {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, folder: id ?? undefined }) });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
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
              原始题库
            </div>
            <h1 className="mt-1 text-2xl font-bold text-foreground">原始题库 · 数学试卷</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <FolderPlus className="h-4 w-4" /> 新建文件夹
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>新建文件夹</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="文件夹名称"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
              />
              <DialogFooter>
                <Button onClick={handleCreateFolder} disabled={creatingFolder}>
                  {creatingFolder ? "创建中..." : "创建"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="gap-1.5" onClick={() => openUpload("paper")}>
            <Upload className="h-4 w-4" /> 批量上传
          </Button>
          {syncPair && (
            <Button
              variant="default"
              className="gap-1.5"
              onClick={handleSyncAnswersFromKeys}
              disabled={syncing}
              title="按年份匹配，从「简版答案」PDF 中提取答案并写入「题目」试卷"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {syncing ? syncProgress || "同步中..." : "一键同步答案"}
            </Button>
          )}
          {currentFolderId && (
            <FolderPermissionsDialog
              folderId={currentFolderId}
              folderName={breadcrumb[breadcrumb.length - 1]?.name ?? "当前文件夹"}
              trigger={
                <Button variant="outline" className="gap-1.5">
                  <Shield className="h-4 w-4" /> 权限设置
                </Button>
              }
            />
          )}
        </div>
      </div>

      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <button
          onClick={() => goToFolder(null)}
          className="hover:text-foreground hover:underline"
        >
          题库根目录
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button
              onClick={() => goToFolder(f.id)}
              className="hover:text-foreground hover:underline"
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : subfolders.length === 0 && papers.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center text-sm text-muted-foreground">
          这里还是空的。新建一个文件夹，或直接上传 PDF。
        </div>
      ) : (
        <div className="space-y-2">
          {subfolders.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-4"
            >
              <button
                onClick={() => goToFolder(f.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <Folder className="h-5 w-5 text-amber-500" />
                <div className="font-medium truncate">{f.name}</div>
              </button>
              <FolderPermissionsDialog
                folderId={f.id}
                folderName={f.name}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    title="权限设置"
                  >
                    <Shield className="h-4 w-4" />
                  </Button>
                }
              />
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
                    <AlertDialogTitle>删除文件夹「{f.name}」？</AlertDialogTitle>
                    <AlertDialogDescription>
                      文件夹中的文件会被移到上一层目录。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteFolder(f.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
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
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                        p.kind === "paper"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {p.kind === "paper" ? "试卷" : "答案"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.kind === "paper" &&
                      (p.question_count > 0 ? (
                        <span>{p.question_count} 道题 · </span>
                      ) : (
                        <span className="text-amber-600">未抽题 · </span>
                      ))}
                    <span>上传于 {new Date(p.created_at).toLocaleDateString()}</span>
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
                    onClick={() => handleDownload(p)}
                    disabled={downloadingId === p.id}
                  >
                    <Download className="h-3.5 w-3.5" /> 下载
                  </Button>
                  {p.kind === "paper" && (
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
                  )}
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
                        <AlertDialogTitle>删除「{p.name}」？</AlertDialogTitle>
                        <AlertDialogDescription>
                          该文件及其全部抽题都会被删除。
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

      {/* Batch upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>批量上传 PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              一次可选多个 PDF，会全部归入当前文件夹「
              {breadcrumb[breadcrumb.length - 1]?.name ?? "题库根目录"}」。
            </p>
            <div className="space-y-2">
              <Label>文件类型</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={uploadKind === "paper" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUploadKind("paper")}
                >
                  试卷
                </Button>
                <Button
                  type="button"
                  variant={uploadKind === "answer" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUploadKind("answer")}
                >
                  答案
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>选择 PDF 文件</Label>
              <Input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
              />
            </div>
            {uploadFiles.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs">
                {uploadFiles.map((f, i) => (
                  <div key={i} className="truncate py-0.5">
                    {f.name}
                  </div>
                ))}
              </div>
            )}
            {uploading && (
              <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadProgress || "上传中..."}
              </div>
            )}
            {uploadError && !uploading && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {uploadError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleBatchUpload} disabled={uploading || uploadFiles.length === 0}>
              {uploading ? "上传中..." : `上传 ${uploadFiles.length} 个文件`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
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
              预览 · {extractTarget?.name}（{extracted.length} 题）
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {extracted.map((q, idx) => (
              <QuestionEditor
                key={q.number}
                q={q}
                pageImages={pageImages}
                paperPdfFile={paperPdfFile}
                totalPdfPages={totalPdfPages}
                onPageRendered={(page, url) => {
                  setPageImages((prev) => {
                    if (prev.has(page)) return prev;
                    const next = new Map(prev);
                    next.set(page, url);
                    return next;
                  });
                }}
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
  pageImages,
  paperPdfFile,
  totalPdfPages,
  onPageRendered,
  onChange,
}: {
  q: ExtractedQuestion;
  pageImages: Map<number, string>;
  paperPdfFile: File | null;
  totalPdfPages: number;
  onPageRendered: (page: number, url: string) => void;
  onChange: (patch: Partial<ExtractedQuestion>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const canCrop = !!(q.regions && q.regions.length > 0 && pageImages.size > 0);
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
          <span
            className={
              "ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] " +
              (q.stem_render_mode === "image"
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600")
            }
            title="题干渲染模式"
          >
            <ImageIcon className="h-3 w-3" /> 题干:{q.stem_render_mode === "image" ? "图" : "文"}
          </span>
          <span
            className={
              "ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] " +
              (q.options_render_mode === "image"
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600")
            }
            title="选项渲染模式"
          >
            <ImageIcon className="h-3 w-3" /> 选项:{q.options_render_mode === "image" ? "图" : "文"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() =>
              onChange({ stem_render_mode: q.stem_render_mode === "image" ? "text" : "image" })
            }
          >
            切题干
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() =>
              onChange({
                options_render_mode: q.options_render_mode === "image" ? "text" : "image",
              })
            }
          >
            切选项
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          </Button>
        </div>
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
        <MathText block text={q.stem} className="mt-1 whitespace-pre-wrap text-muted-foreground" />
      )}
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {(["a", "b", "c", "d", "e"] as const).map((k) => {
          const v = q[`option_${k}` as const] as string | null;
          if (!v) return null;
          return (
            <div key={k}>
              <span className="font-semibold">{k.toUpperCase()}.</span> <MathText text={v} />
            </div>
          );
        })}
      </div>

      {q.stemImageDataUrl && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              题干截图
            </div>
            {canCrop && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={() => setCropOpen(true)}
              >
                <Crop className="h-3 w-3" /> 调整截图
              </Button>
            )}
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

      {canCrop && (
        <CropEditDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          initialRegions={q.regions!}
          pageImages={pageImages}
          paperPdfFile={paperPdfFile}
          totalPdfPages={totalPdfPages}
          onPageRendered={onPageRendered}
          onSaved={(regions, blob, dataUrl) => {
            if (q.stemImageDataUrl) {
              try { URL.revokeObjectURL(q.stemImageDataUrl); } catch { /* noop */ }
            }
            onChange({
              regions,
              stemImageBlob: blob,
              stemImageDataUrl: dataUrl,
            });
          }}
        />
      )}
    </div>
  );
}

function CropEditDialog({
  open,
  onOpenChange,
  initialRegions,
  pageImages,
  paperPdfFile,
  totalPdfPages,
  onPageRendered,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialRegions: Region[];
  pageImages: Map<number, string>;
  paperPdfFile: File | null;
  totalPdfPages: number;
  onPageRendered: (page: number, url: string) => void;
  onSaved: (regions: Region[], blob: Blob, dataUrl: string) => void;
}) {
  const [regions, setRegions] = useState<Region[]>(initialRegions);
  const [saving, setSaving] = useState(false);
  const [renderingPage, setRenderingPage] = useState<number | null>(null);
  useEffect(() => {
    if (open) setRegions(initialRegions.map((r) => ({ page: r.page, bbox: { ...r.bbox } })));
  }, [open, initialRegions]);

  const ensurePage = async (page: number) => {
    if (pageImages.has(page) || !paperPdfFile) return;
    setRenderingPage(page);
    try {
      const canvas = await renderPdfPageCanvas(paperPdfFile, page, 2.5);
      const url = canvas.toDataURL("image/jpeg", 0.85);
      canvas.width = 0;
      canvas.height = 0;
      onPageRendered(page, url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "渲染页面失败");
    } finally {
      setRenderingPage(null);
    }
  };

  const updateBbox = (i: number, bbox: Region["bbox"]) => {
    setRegions((rs) => rs.map((r, idx) => (idx === i ? { ...r, bbox } : r)));
  };
  const updatePage = async (i: number, page: number) => {
    await ensurePage(page);
    setRegions((rs) => rs.map((r, idx) => (idx === i ? { ...r, page } : r)));
  };
  const removeRegion = (i: number) => {
    setRegions((rs) => rs.filter((_, idx) => idx !== i));
  };
  const addRegion = async () => {
    const last = regions[regions.length - 1];
    const nextPage = last ? Math.min(totalPdfPages - 1, last.page + 1) : 0;
    await ensurePage(nextPage);
    setRegions((rs) => [
      ...rs,
      { page: nextPage, bbox: { x: 0.08, y: 0.4, w: 0.84, h: 0.2 } },
    ]);
  };

  const handleApply = async () => {
    setSaving(true);
    try {
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("加载页面图片失败"));
          img.src = src;
        });
      const crops: HTMLCanvasElement[] = [];
      for (const r of regions) {
        const src = pageImages.get(r.page);
        if (!src) continue;
        const img = await loadImg(src);
        const pad = 0.003;
        const x = Math.max(0, (r.bbox.x - pad) * img.naturalWidth);
        const y = Math.max(0, (r.bbox.y - pad) * img.naturalHeight);
        const w = Math.min(img.naturalWidth - x, (r.bbox.w + pad * 2) * img.naturalWidth);
        const h = Math.min(img.naturalHeight - y, (r.bbox.h + pad * 2) * img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = Math.ceil(w);
        c.height = Math.ceil(h);
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
        crops.push(c);
      }
      if (!crops.length) throw new Error("无可裁剪的区域");
      const maxW = Math.max(...crops.map((c) => c.width));
      const totalH = crops.reduce((s, c) => s + c.height, 0);
      const out = document.createElement("canvas");
      out.width = maxW;
      out.height = totalH;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("canvas 上下文创建失败");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, maxW, totalH);
      let cy = 0;
      for (const c of crops) {
        ctx.drawImage(c, 0, cy);
        cy += c.height;
      }
      const blob = await new Promise<Blob>((res, rej) =>
        out.toBlob((b) => (b ? res(b) : rej(new Error("生成图片失败"))), "image/png"),
      );
      const dataUrl = URL.createObjectURL(blob);
      onSaved(regions, blob, dataUrl);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "应用失败");
    } finally {
      setSaving(false);
    }
  };

  const pageOptions = Array.from({ length: Math.max(totalPdfPages, 1) }, (_, i) => i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>调整截图区域</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          支持跨页与多段截图：每个区域可独立选择页码并拖动调整，最终按顺序竖向拼接为题干截图。
        </p>
        <div className="space-y-4">
          {regions.map((r, i) => (
            <div key={i} className="rounded border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">区域 {i + 1}</span>
                  <label className="flex items-center gap-1">
                    页码：
                    <select
                      value={r.page}
                      onChange={(e) => updatePage(i, Number(e.target.value))}
                      className="rounded border bg-background px-1 py-0.5 text-xs"
                    >
                      {pageOptions.map((p) => (
                        <option key={p} value={p}>
                          第 {p + 1} 页
                        </option>
                      ))}
                    </select>
                  </label>
                  {renderingPage === r.page && (
                    <span className="text-[10px] text-muted-foreground">加载页面中...</span>
                  )}
                </div>
                {regions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() => removeRegion(i)}
                  >
                    删除
                  </Button>
                )}
              </div>
              <CropRegionEditor
                region={r}
                imageUrl={pageImages.get(r.page) ?? null}
                onChange={(bbox) => updateBbox(i, bbox)}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={addRegion}
            disabled={saving || renderingPage !== null}
          >
            + 添加截图区域（支持跨页）
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleApply} disabled={saving || regions.length === 0}>
            {saving ? "应用中..." : "应用"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CropRegionEditor({
  region,
  imageUrl,
  onChange,
}: {
  region: Region;
  imageUrl: string | null;
  onChange: (bbox: Region["bbox"]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<
    | null
    | {
        mode: string;
        startX: number;
        startY: number;
        startBbox: Region["bbox"];
      }
  >(null);
  const bbox = region.bbox;

  useEffect(() => {
    if (!drag) return;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const onMove = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dxN = (e.clientX - drag.startX) / rect.width;
      const dyN = (e.clientY - drag.startY) / rect.height;
      let { x, y, w, h } = drag.startBbox;
      if (drag.mode === "move") {
        x = clamp01(drag.startBbox.x + dxN);
        y = clamp01(drag.startBbox.y + dyN);
        x = Math.min(x, 1 - w);
        y = Math.min(y, 1 - h);
      } else {
        if (drag.mode.includes("e")) {
          w = Math.max(0.02, Math.min(1 - x, drag.startBbox.w + dxN));
        }
        if (drag.mode.includes("s")) {
          h = Math.max(0.02, Math.min(1 - y, drag.startBbox.h + dyN));
        }
        if (drag.mode.includes("w")) {
          const nx = clamp01(drag.startBbox.x + dxN);
          const limited = Math.min(nx, drag.startBbox.x + drag.startBbox.w - 0.02);
          x = Math.max(0, limited);
          w = Math.max(0.02, drag.startBbox.w - (x - drag.startBbox.x));
        }
        if (drag.mode.includes("n")) {
          const ny = clamp01(drag.startBbox.y + dyN);
          const limited = Math.min(ny, drag.startBbox.y + drag.startBbox.h - 0.02);
          y = Math.max(0, limited);
          h = Math.max(0.02, drag.startBbox.h - (y - drag.startBbox.y));
        }
      }
      onChange({ x, y, w, h });
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, onChange]);

  const startDrag = (mode: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ mode, startX: e.clientX, startY: e.clientY, startBbox: { ...bbox } });
  };

  if (!imageUrl) {
    return <div className="text-xs text-destructive">第 {region.page + 1} 页缺少图像缓存</div>;
  }
  const handles: Array<{
    d: string;
    style: React.CSSProperties;
    cursor: string;
  }> = [
    { d: "nw", style: { top: -5, left: -5 }, cursor: "nwse-resize" },
    { d: "ne", style: { top: -5, right: -5 }, cursor: "nesw-resize" },
    { d: "sw", style: { bottom: -5, left: -5 }, cursor: "nesw-resize" },
    { d: "se", style: { bottom: -5, right: -5 }, cursor: "nwse-resize" },
    { d: "n", style: { top: -5, left: "50%", marginLeft: -5 }, cursor: "ns-resize" },
    { d: "s", style: { bottom: -5, left: "50%", marginLeft: -5 }, cursor: "ns-resize" },
    { d: "w", style: { left: -5, top: "50%", marginTop: -5 }, cursor: "ew-resize" },
    { d: "e", style: { right: -5, top: "50%", marginTop: -5 }, cursor: "ew-resize" },
  ];
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-muted-foreground">第 {region.page + 1} 页</div>
      <div
        ref={containerRef}
        className="relative w-full select-none overflow-hidden rounded border bg-muted/30"
        style={{ touchAction: "none" }}
      >
        <img
          src={imageUrl}
          alt=""
          className="pointer-events-none block w-full"
          draggable={false}
        />
        <div
          className="absolute cursor-move border-2 border-blue-500 bg-blue-500/10"
          style={{
            left: `${bbox.x * 100}%`,
            top: `${bbox.y * 100}%`,
            width: `${bbox.w * 100}%`,
            height: `${bbox.h * 100}%`,
          }}
          onPointerDown={startDrag("move")}
        >
          {handles.map((h) => (
            <div
              key={h.d}
              onPointerDown={startDrag(h.d)}
              style={{
                position: "absolute",
                width: 10,
                height: 10,
                background: "#3b82f6",
                border: "1px solid white",
                cursor: h.cursor,
                ...h.style,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
