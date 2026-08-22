import { CanvasFactory, getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

// Keep the worker bootstrap import above `pdf-parse`. In Node/serverless
// runtimes, pdf-parse relies on this helper to supply a canvas factory and
// worker path that avoid DOM globals such as DOMMatrix at import time.
let parserConfigured = false;
function ensureParserConfigured() {
  if (parserConfigured) return;
  PDFParse.setWorker(getData());
  parserConfigured = true;
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
  ensureParserConfigured();
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
