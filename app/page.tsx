"use client";

import { useState } from "react";
import { UploadArea } from "@/components/UploadArea";
import { LengthSelector } from "@/components/LengthSelector";
import { SummaryResult } from "@/components/SummaryResult";
import { LoadingIndicator, ErrorBanner } from "@/components/StatusBanners";
import { SummaryLength, SummarizeResponse, ApiErrorResponse } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "error";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [length, setLength] = useState<SummaryLength>("medium");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResponse | null>(null);

  const isProcessing = status === "loading";

  function reset() {
    setFile(null);
    setStatus("idle");
    setError(null);
    setResult(null);
  }

  function handleFileSelected(f: File) {
    setFile(f);
    setStatus("idle");
    setError(null);
    setResult(null);
  }

  async function handleSummarize() {
    if (!file) return;
    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("length", length);

      const res = await fetch("/api/summarize", {
        method: "POST",
        body: formData,
      });

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        setError(
          res.ok
            ? "The server sent back an unexpected response. Please try again."
            : `The server returned an error (status ${res.status}) without details. Please try again in a moment.`
        );
        setStatus("error");
        return;
      }

      if (!res.ok) {
        const errData = data as ApiErrorResponse;
        setError(errData.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setResult(data as SummarizeResponse);
      setStatus("success");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <header className="mb-10">
          <p className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] mb-2">
            pdf · jpg · png → summary
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[var(--ink)]">
            Document Summary Assistant
          </h1>
          <p className="mt-2 text-[var(--ink-soft)] text-sm sm:text-base">
            Upload a document and get a summary with the key points pulled out.
          </p>
        </header>

        <div className="space-y-6">
          <UploadArea
            file={file}
            onFileSelected={handleFileSelected}
            onClear={reset}
            disabled={isProcessing}
          />

          {file && (
            <>
              <LengthSelector value={length} onChange={setLength} disabled={isProcessing} />

              <button
                type="button"
                onClick={handleSummarize}
                disabled={isProcessing}
                className="w-full rounded-xl bg-[var(--ink)] text-[var(--paper)] font-medium py-3.5 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isProcessing ? "Reading document…" : "Summarize"}
              </button>
            </>
          )}

          {status === "loading" && <LoadingIndicator label="Extracting text and summarizing…" />}
          {status === "error" && error && <ErrorBanner message={error} />}
          {status === "success" && result && (
            <>
              <SummaryResult result={result} />
              <button
                type="button"
                onClick={reset}
                className="w-full rounded-xl border border-[var(--border)] text-[var(--ink-soft)] font-medium py-3 hover:border-[var(--ink-soft)] transition-colors"
              >
                Summarize another document
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
