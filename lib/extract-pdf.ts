import { PDFParse } from "pdf-parse";
import { createCanvas } from "@napi-rs/canvas";
import path from "node:path";

// pdfjs-dist (used internally by pdf-parse) expects browser canvas APIs
// (DOMMatrix, ImageData, etc.) that don't exist in plain Node.js. This
// works locally by accident in some setups but fails in a clean
// serverless environment like Vercel with "ReferenceError: DOMMatrix is
// not defined". The fix is to provide a native canvas polyfill.
//
// pdf-parse ships its own CanvasFactory at "pdf-parse/worker" for this
// exact purpose, but importing that subpath specifically breaks under
// Next.js/Turbopack's module interop when the package is externalized
// (the class comes through as an unconstructable object at runtime,
// confirmed by testing in plain Node vs. inside the Next.js bundle).
// Implementing the same small interface ourselves directly against
// @napi-rs/canvas sidesteps that bundler-specific bug entirely.
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

// pdfjs-dist also tries to locate its worker file using a path computed
// relative to its own module location, which can break in serverless
// deployments where the directory layout differs from a normal local
// install. Setting the worker path explicitly with an absolute
// filesystem path sidesteps that. pdf-parse uses pdfjs-dist's "legacy"
// build (confirmed via its exports), so we point at that build's worker.
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

// PDF text extraction using pdf-parse v2. Works for standard, text-based
// PDFs. If the extracted text is suspiciously short relative to page
// count, we treat the PDF as "likely scanned" and let the caller decide
// how to respond (this MVP doesn't render scanned PDF pages to images —
// see README "Known limitations").
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
