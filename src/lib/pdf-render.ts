// Client-side PDF rendering using pdfjs-dist.
// Renders each page of a PDF File to a canvas, returns data URLs and canvases.

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPage {
  pageIndex: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  dataUrl: string; // jpeg
}

export async function renderPdfPages(file: File, scale = 1.6): Promise<RenderedPage[]> {
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
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    pages.push({
      pageIndex: i - 1,
      width: canvas.width,
      height: canvas.height,
      canvas,
      dataUrl,
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
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("裁剪失败"))),
      "image/png",
    ),
  );
}
