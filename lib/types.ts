export type SummaryLength = "short" | "medium" | "long";

export interface SummarizeResponse {
  summary: string;
  keyPoints: string[];
  improvementSuggestions: string[];
  length: SummaryLength;
  sourceType: "pdf" | "image";
  usedOCR: boolean;
  extractedCharCount: number;
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
