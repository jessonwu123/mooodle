// Client-side PDF rendering using pdfjs-dist.
// Renders each page of a PDF File to a canvas, returns data URLs and canvases.
// pdfjs-dist is loaded lazily inside the function so it never executes during SSR.

export interface RenderedPage {
  pageIndex: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
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
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("页面图片生成失败"))), "image/jpeg", jpegQuality),
    );
    pages.push({
      pageIndex: i - 1,
      width: canvas.width,
      height: canvas.height,
      canvas,
      blob,
    });
  }
  return pages;
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
