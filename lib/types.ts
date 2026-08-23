export type SummaryLength = "short" | "medium" | "long";

export interface SummarizeResponse {
  summary: string;
  keyPoints: string[];
  improvementSuggestions: string[];
  length: SummaryLength;
  sourceType: "pdf" | "image";
  usedOCR: boolean;
  extractedCharCount: number;
  /**
   * Present only for scanned PDFs (sourceType "pdf" with usedOCR true).
   * pagesProcessed can be less than totalPages if the document exceeded
   * the per-request page cap or the OCR time budget — see
   * MAX_SCANNED_PDF_PAGES in lib/extract-pdf.ts.
   */
  ocrPageInfo?: {
    pagesProcessed: number;
    totalPages: number;
  };
}

export interface ApiErrorResponse {
  error: string;
}

export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 4);

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
