// Client-side PDF rendering using pdfjs-dist.
// Renders each page of a PDF File to a canvas, returns data URLs and canvases.
// pdfjs-dist is loaded lazily inside the function so it never executes during SSR.

export interface RenderedPage {
  pageIndex: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement | null;
  blob: Blob; // jpeg
  dataUrl?: string; // kept optional for previews/debug only
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function loadPdfjs() {
  if (typeof window === "undefined") throw new Error("pdfjs-dist 只能在浏览器中使用");
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfjsPromise;
}

export async function renderPdfPages(
  file: File,
  scale = 1.15,
  jpegQuality = 0.68,
  keepCanvas = false,
): Promise<RenderedPage[]> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 canvas 上下文");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("页面图片生成失败"))),
        "image/jpeg",
        jpegQuality,
      ),
    );
    pages.push({
      pageIndex: i - 1,
      width: canvas.width,
      height: canvas.height,
      canvas: keepCanvas ? canvas : null,
      blob,
    });
    if (!keepCanvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return pages;
}

export async function renderPdfPageCanvas(file: File, pageIndex: number, scale = 1.15) {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 canvas 上下文");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

export function cropCanvasToBlob(
  canvas: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number },
  padding = 0.01,
): Promise<Blob> {
  const x = Math.max(0, (bbox.x - padding) * canvas.width);
  const y = Math.max(0, (bbox.y - padding) * canvas.height);
  const w = Math.min(canvas.width - x, (bbox.w + padding * 2) * canvas.width);
  const h = Math.min(canvas.height - y, (bbox.h + padding * 2) * canvas.height);
  const out = document.createElement("canvas");
  out.width = Math.ceil(w);
  out.height = Math.ceil(h);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("无法创建 canvas 上下文");
  ctx.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("裁剪失败"))), "image/png"),
  );
}

// 从 PDF 文本层抽取每页所有文本片段（坐标已归一化到 0-1，左上角原点）。
// 用来定位题号 "1." "16." 等锚点和选项 "(A)" 锚点。
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PdfPageText {
  pageIndex: number;
  items: PdfTextItem[];
}
export async function getPdfTextItems(file: File): Promise<PdfPageText[]> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: PdfPageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const raw of content.items as Array<{
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    }>) {
      if (typeof raw.str !== "string" || !raw.str.trim()) continue;
      const tr = raw.transform;
      if (!Array.isArray(tr) || tr.length < 6) continue;
      const b = tr[1];
      const d = tr[3];
      const e = tr[4];
      const f = tr[5];
      const fontHeight = Math.hypot(b, d) || raw.height || 0;
      const [vx, vy] = viewport.convertToViewportPoint(e, f);
      items.push({
        str: raw.str,
        x: vx / viewport.width,
        y: (vy - fontHeight) / viewport.height,
        w: (raw.width || 0) / viewport.width,
        h: fontHeight / viewport.height,
      });
    }
    pages.push({ pageIndex: i - 1, items });
  }
  return pages;
}

