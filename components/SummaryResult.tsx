"use client";

import { useState } from "react";
import { SummarizeResponse } from "@/lib/types";
import { downloadSummaryPdf } from "@/lib/download-summary-pdf";

export function SummaryResult({ result }: { result: SummarizeResponse }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadSummaryPdf(result);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--paper-card)] p-5 sm:p-8">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          <Badge>{result.sourceType === "pdf" ? "PDF" : "Image"}</Badge>
          {result.usedOCR && <Badge>OCR applied</Badge>}
          <Badge>{result.length} summary</Badge>
          <Badge>{result.extractedCharCount.toLocaleString()} chars read</Badge>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          aria-label="Download summary as PDF"
          title="Download summary as PDF"
          className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--ink-soft)] hover:border-[var(--ink-soft)] transition-colors disabled:opacity-50"
        >
          {downloading ? (
            <span className="h-4 w-4 rounded-full border-2 border-[var(--ink-soft)] border-t-transparent animate-spin" />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4.5 w-4.5"
            >
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 19h16" />
            </svg>
          )}
        </button>
      </div>

      <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] mb-2">
        Summary
      </h2>
      <p className="font-display text-base sm:text-lg leading-relaxed text-[var(--ink)] whitespace-pre-line">
        {result.summary}
      </p>

      {result.keyPoints.length > 0 && (
        <div className="mt-8">
          <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] mb-3">
            Key points
          </h2>
          <ul className="space-y-3">
            {result.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="font-mono text-xs text-[var(--muted)] mt-1.5 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="highlight-mark text-sm sm:text-base leading-relaxed">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] sm:text-xs uppercase tracking-wide text-[var(--ink-soft)] border border-[var(--border)] rounded-full px-2.5 py-1">
      {children}
    </span>
  );
}
