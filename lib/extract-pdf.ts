import { PDFParse } from "pdf-parse";
import { createCanvas } from "@napi-rs/canvas";
import path from "node:path";

class CanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(canvasAndContext: { canvas: ReturnType<typeof createCanvas> | null }, width: number, height: number) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
  }
  destroy(canvasAndContext: { canvas: unknown; context: unknown }) {
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}


let workerConfigured = false;
function ensureWorkerConfigured() {
  if (workerConfigured) return;
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs"
  );
  PDFParse.setWorker(workerPath);
  workerConfigured = true;
}


export interface PdfExtractionResult {
  text: string;
  numPages: number;
  likelyScanned: boolean;
}

const MIN_CHARS_PER_PAGE_THRESHOLD = 20;

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  ensureWorkerConfigured();
  // pdf-parse instantiates this itself internally (`new CanvasFactory()`),
  // so we pass the class, not an instance.
  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    const result = await parser.getText();
    const text = (result.text || "").trim();
    const numPages = result.total || result.pages?.length || 1;

    const avgCharsPerPage = text.length / Math.max(numPages, 1);
    const likelyScanned = avgCharsPerPage < MIN_CHARS_PER_PAGE_THRESHOLD;

    return { text, numPages, likelyScanned };
  } finally {
    await parser.destroy();
  }
}


export const MAX_SCANNED_PDF_PAGES = 10;

export interface PdfPageImage {
  pageNumber: number;
  data: Buffer;
}

export interface PdfPageImagesResult {
  images: PdfPageImage[];
  totalPages: number;
  
  truncated: boolean;
}

export async function extractScannedPdfPageImages(
  buffer: Buffer,
  totalPages: number
): Promise<PdfPageImagesResult> {
  ensureWorkerConfigured();
  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    const pagesToProcess = Math.min(totalPages, MAX_SCANNED_PDF_PAGES);
    const pageNumbers = Array.from({ length: pagesToProcess }, (_, i) => i + 1);

    
    const result = await parser.getImage({ partial: pageNumbers, imageThreshold: 0 });

    const images: PdfPageImage[] = [];
    result.pages.forEach((page, index) => {
      if (!page.images || page.images.length === 0) return;
      const largest = page.images.reduce((a, b) => {
        const areaA = (a.width ?? 0) * (a.height ?? 0);
        const areaB = (b.width ?? 0) * (b.height ?? 0);
        return areaB > areaA ? b : a;
      });
      images.push({
        pageNumber: pageNumbers[index],
        data: Buffer.isBuffer(largest.data) ? largest.data : Buffer.from(largest.data),
      });
    });

    return {
      images,
      totalPages,
      truncated: totalPages > pagesToProcess,
    };
  } finally {
    await parser.destroy();
  }
}
