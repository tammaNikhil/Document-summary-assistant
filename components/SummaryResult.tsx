import { SummarizeResponse } from "@/lib/types";

export function SummaryResult({ result }: { result: SummarizeResponse }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--paper-card)] p-5 sm:p-8">
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge>{result.sourceType === "pdf" ? "PDF" : "Image"}</Badge>
        {result.usedOCR && <Badge>OCR applied</Badge>}
        <Badge>{result.length} summary</Badge>
        <Badge>{result.extractedCharCount.toLocaleString()} chars read</Badge>
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
