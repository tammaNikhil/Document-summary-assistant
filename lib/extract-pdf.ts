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
// count, we treat the PDF as "likely scanned" and the caller extracts
// each page's embedded scan image and runs it through OCR instead (see
// extractScannedPdfPageImages below).
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

// Getting a scanned PDF's pages as images so OCR can run on them.
//
// This does NOT render (rasterize) the pages via canvas, on purpose.
// The first version of this used pdf-parse's getScreenshot(), which
// draws each page onto a canvas via pdfjs-dist — and that hit a real
// production failure: "Value is none of these types `String`, `Path`"
// / "InvalidArg" from the native @napi-rs/canvas binding, thrown deep
// inside pdfjs's CanvasGraphics rendering path. This is a known class
// of bug (see e.g. github.com/Brooooooklyn/canvas/issues/994): when
// pdfjs-dist actually draws content onto the canvas, the native
// binding's argument type-checks rely on `instanceof` against its own
// exported classes, and bundlers like Next.js/Turbopack can end up
// loading a second copy of @napi-rs/canvas's module — so the object
// pdfjs hands the binding fails the check even though it's the "right"
// type. getText() never hit this because it doesn't draw anything (the
// canvas there is only used for font-metric measurement); getScreenshot
// hits it because rendering is the whole point.
//
// A scanned PDF is, structurally, just one full-page photo embedded per
// page — there's no vector content to rasterize in the first place. So
// instead of rendering, we extract that embedded image directly via
// pdf-parse's getImage(), which reads the image XObject's bytes straight
// out of the PDF's object streams. No canvas drawing calls happen at
// all, which sidesteps this bug entirely (and is cheaper: no
// rasterization work, and we get the scan at whatever resolution it was
// actually scanned at instead of a re-sampled copy).
//
// OCR-ing a whole PDF page-by-page is inherently slower than OCR-ing a
// single uploaded image, so we cap how many pages we'll process per
// request. This is a pragmatic MVP limit, not a technical ceiling —
// see MAX_SCANNED_PDF_PAGES.
export const MAX_SCANNED_PDF_PAGES = 10;

export interface PdfPageImage {
  pageNumber: number;
  data: Buffer;
}

export interface PdfPageImagesResult {
  images: PdfPageImage[];
  totalPages: number;
  /** true if the PDF has more pages than we processed, i.e. MAX_SCANNED_PDF_PAGES was hit. */
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

    // imageThreshold: 0 disables pdf-parse's default "drop images under
    // 80px" filtering. We want every image on the page so we can pick
    // the largest one ourselves below — the scan itself is always going
    // to be the largest image on a scanned page (a stray small logo or
    // stamp shouldn't get mistaken for it), so a fixed pixel cutoff
    // isn't the right tool here.
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
