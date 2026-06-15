import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
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
  const navigate = useNavigate({ from: "/admin/question-bank" });
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
  const [savingPreview, setSavingPreview] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string>("");

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
      // 最高优先级：用 AI 抽取的题干文字内容在 PDF 文本层中精确定位，
      // 保证图片内容与提取文字一致；题号 "N." 作为辅助参考。
      let pageTexts: PdfPageText[] = [];
      try {
        pageTexts = await getPdfTextItems(paperPdfFile);
      } catch (err) {
        console.warn("PDF 文本锚点解析失败，回退到 AI bbox", err);
      }

      // 为每页构建按阅读顺序拼接的归一化文本流，并记录每个字符对应的 y 坐标
      const normalizeText = (s: string) =>
        s
          .replace(/\$[^$]*\$/g, " ")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
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
          if (idx >= 0) {
            return { page: ps.pageIndex, pos: idx, y: ps.ys[idx] };
          }
        }
        return null;
      };

      // 题号锚点（辅助）
      type NumAnchor = { num: number; page: number; y: number; x: number };
      const numAnchorsAll: NumAnchor[] = [];
      for (const pt of pageTexts) {
        for (const it of pt.items) {
          const m = it.str.trim().match(/^(\d{1,2})\.$/);
          if (m && it.x < 0.5) {
            const n = Number(m[1]);
            if (n >= 1 && n <= 25)
              numAnchorsAll.push({ num: n, page: pt.pageIndex, y: it.y, x: it.x });
          }
        }
      }

      // 按题号顺序定位 stem 起点
      type StemLoc = { page: number; y: number };
      const stemLocByNum = new Map<number, StemLoc>();
      const sortedQs = [...qs].sort((a, b) => a.number - b.number);
      let cursorPage = 0;
      let cursorPos = 0;
      for (const q of sortedQs) {
        const fullNorm = normalizeText(q.stem ?? "");
        let hit: Hit | null = null;
        for (const len of [40, 30, 20, 14, 10, 8]) {
          if (fullNorm.length < len) continue;
          hit = findText(fullNorm.slice(0, len), cursorPage, cursorPos);
          if (hit) break;
        }
        if (hit) {
          stemLocByNum.set(q.number, { page: hit.page, y: hit.y });
          cursorPage = hit.page;
          cursorPos = hit.pos + 1;
          continue;
        }
        // 退化：题号锚点（必须在 cursor 之后）
        const candidates = numAnchorsAll.filter(
          (a) =>
            a.num === q.number &&
            (a.page > cursorPage ||
              (a.page === cursorPage &&
                (cursorPos === 0 ||
                  a.y >
                    (pageStreams[a.page]?.ys[cursorPos - 1] ?? 0) - 0.005))),
        );
        if (candidates.length) {
          const aiPage = q.stem_page_index ?? q.page_index ?? 0;
          const aiY = q.stem_bbox?.y ?? 0.5;
          const best = candidates.reduce((b, c) =>
            Math.abs(c.page - aiPage) * 10 + Math.abs(c.y - aiY) <
            Math.abs(b.page - aiPage) * 10 + Math.abs(b.y - aiY)
              ? c
              : b,
          );
          stemLocByNum.set(q.number, { page: best.page, y: best.y });
          cursorPage = best.page;
          cursorPos = 0;
        }
      }

      // 用 stem 位置覆盖 bbox。横向沿用 AI bbox，由 tighten 阶段统一列宽。
      for (const q of qs) {
        const loc = stemLocByNum.get(q.number);
        if (!loc) continue;
        const next = stemLocByNum.get(q.number + 1) ?? null;
        const stemTop = Math.max(0, loc.y - 0.01);

        // 在 stem 起点页面查找 "(A)" —— 同页选项的顶界
        const optAItem = pageTexts[loc.page]?.items
          .filter((it) => /^\(A\)/.test(it.str.trim()) && it.y > loc.y + 0.005)
          .sort((a, b) => a.y - b.y)[0];

        const stemBboxBase = q.stem_bbox ?? { x: 0.05, y: 0, w: 0.9, h: 0 };
        const optsBboxBase = q.options_bbox ?? { x: 0.05, y: 0, w: 0.9, h: 0 };

        if (optAItem && (!next || next.page > loc.page || optAItem.y < next.y)) {
          q.stem_page_index = loc.page;
          q.options_page_index = loc.page;
          q.stem_bbox = {
            x: stemBboxBase.x,
            w: stemBboxBase.w,
            y: stemTop,
            h: Math.max(0.01, optAItem.y - 0.006 - stemTop),
          };
          const optsBottom =
            next && next.page === loc.page ? next.y - 0.006 : 0.98;
          q.options_bbox = {
            x: optsBboxBase.x,
            w: optsBboxBase.w,
            y: optAItem.y - 0.006,
            h: Math.max(0.01, optsBottom - (optAItem.y - 0.006)),
          };
        } else if (next && next.page > loc.page) {
          q.stem_page_index = loc.page;
          q.stem_bbox = {
            x: stemBboxBase.x,
            w: stemBboxBase.w,
            y: stemTop,
            h: Math.max(0.01, 0.98 - stemTop),
          };
          const nextPageOptA = pageTexts[next.page]?.items
            .filter(
              (it) => /^\(A\)/.test(it.str.trim()) && it.y < next.y - 0.005,
            )
            .sort((a, b) => a.y - b.y)[0];
          if (nextPageOptA) {
            q.options_page_index = next.page;
            q.options_bbox = {
              x: optsBboxBase.x,
              w: optsBboxBase.w,
              y: nextPageOptA.y - 0.006,
              h: Math.max(0.01, next.y - 0.006 - (nextPageOptA.y - 0.006)),
            };
          } else {
            q.options_page_index = loc.page;
            q.options_bbox = null;
          }
        } else {
          const bottom = next && next.page === loc.page ? next.y - 0.006 : 0.98;
          q.stem_page_index = loc.page;
          q.stem_bbox = {
            x: stemBboxBase.x,
            w: stemBboxBase.w,
            y: stemTop,
            h: Math.max(0.01, bottom - stemTop),
          };
        }
      }

      setStage("裁剪题目与选项截图...");
      // 每张页面单独收集落在该页上的 slot（题干 / 选项分别可能在不同页）
      type Slot = {
        q: ExtractedQuestion;
        kind: "stem" | "options";
        bbox: NonNullable<Bbox>;
      };
      const slotsByPage = new Map<number, Slot[]>();
      for (const q of qs) {
        if (q.stem_bbox && paperPages[q.stem_page_index]) {
          const arr = slotsByPage.get(q.stem_page_index) ?? [];
          arr.push({ q, kind: "stem", bbox: { ...q.stem_bbox } });
          slotsByPage.set(q.stem_page_index, arr);
        }
        if (q.options_bbox && paperPages[q.options_page_index]) {
          const arr = slotsByPage.get(q.options_page_index) ?? [];
          arr.push({ q, kind: "options", bbox: { ...q.options_bbox } });
          slotsByPage.set(q.options_page_index, arr);
        }
      }
      // 在每一页内：横向扩到该页 slot 的列宽，纵向只填补相邻 slot 间的空白，
      // 并强制 stem 底部严格停在同页 options 顶部之上。
      const tightenSlotsOnPage = (pageSlots: Slot[]) => {
        // 1) 同题且同页：把 stem 底部裁到 options 顶部之上，**始终执行**，
        //    防止 AI 把 (A)(B)... 选项行错误地圈进 stem_bbox。
        for (const s of pageSlots) {
          if (s.kind !== "stem") continue;
          const q = s.q;
          if (
            q.options_bbox &&
            q.stem_page_index === q.options_page_index
          ) {
            const stemTop = s.bbox.y;
            const optsTop = q.options_bbox.y;
            // 题干顶部必须高于选项顶部；否则保留 AI 给的（罕见，可能跨布局）
            if (stemTop < optsTop) {
              const maxBottom = optsTop - 0.006;
              const newH = Math.max(0.01, maxBottom - stemTop);
              if (newH < s.bbox.h) s.bbox.h = newH;
            }
          }
        }

        // 2) 横向：扩到该页所有 slot 的列宽并加 padX 边距
        let minX = 1;
        let maxX = 0;
        for (const s of pageSlots) {
          minX = Math.min(minX, s.bbox.x);
          maxX = Math.max(maxX, s.bbox.x + s.bbox.w);
        }
        const padX = 0.03;
        const colX = Math.max(0, minX - padX);
        const colRight = Math.min(1, maxX + padX);

        // 3) 纵向：按 y 排序，只做极轻微的扩展（约一行间距），避免把上下 slot 卷进来
        const sorted = [...pageSlots].sort((a, b) => a.bbox.y - b.bbox.y);
        const padY = 0.002;
        for (let i = 0; i < sorted.length; i++) {
          const cur = sorted[i];
          const prev = sorted[i - 1];
          const next = sorted[i + 1];
          const topLimit = prev ? prev.bbox.y + prev.bbox.h + padY : 0;
          let bottomLimit = next ? next.bbox.y - padY : 1;
          if (
            cur.kind === "stem" &&
            cur.q.options_bbox &&
            cur.q.stem_page_index === cur.q.options_page_index
          ) {
            bottomLimit = Math.min(bottomLimit, cur.q.options_bbox.y - 0.006);
          }
          const newY = Math.max(topLimit, cur.bbox.y - padY);
          const newBottom = Math.min(bottomLimit, cur.bbox.y + cur.bbox.h + padY);
          cur.bbox.x = colX;
          cur.bbox.w = Math.max(0, colRight - colX);
          cur.bbox.y = newY;
          cur.bbox.h = Math.max(0, newBottom - newY);
        }
      };

      for (const [pageIndex, pageSlots] of slotsByPage) {
        tightenSlotsOnPage(pageSlots);
        setStage(`裁剪第 ${pageIndex + 1} 页（${pageSlots.length} 块）...`);
        const canvas = await renderPdfPageCanvas(paperPdfFile, pageIndex, 1.15);
        try {
          for (const s of pageSlots) {
            const pad = 0.003;
            try {
              const blob = await cropCanvasToBlob(canvas, s.bbox, pad);
              if (s.kind === "stem") {
                s.q.stemImageBlob = blob;
                s.q.stemImageDataUrl = URL.createObjectURL(blob);
              } else {
                s.q.optionsImageBlob = blob;
                s.q.optionsImageDataUrl = URL.createObjectURL(blob);
              }
            } catch (err) {
              console.error("crop failed", s.q.number, s.kind, err);
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

  const goToFolder = (id: string | null) => {
    navigate({ search: { folder: id } });
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
