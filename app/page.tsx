"use client";

import { useState } from "react";
import { UploadArea } from "@/components/UploadArea";
import { LengthSelector } from "@/components/LengthSelector";
import { SummaryResult } from "@/components/SummaryResult";
import { LoadingIndicator, ErrorBanner } from "@/components/StatusBanners";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SummaryLength, SummarizeResponse, ApiErrorResponse } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "error";
type LoadingStage = "extracting" | "summarizing";

type StreamEvent =
  | { stage: "extracting" }
  | { stage: "summarizing" }
  | { stage: "done"; result: SummarizeResponse }
  | { stage: "error"; error: string };

const STAGE_LABEL: Record<LoadingStage, string> = {
  extracting: "Reading your document…",
  summarizing: "Writing your summary…",
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [length, setLength] = useState<SummaryLength>("medium");
  const [status, setStatus] = useState<Status>("idle");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("extracting");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResponse | null>(null);

  const isProcessing = status === "loading";

  function reset() {
    setFile(null);
    setStatus("idle");
    setLoadingStage("extracting");
    setError(null);
    setResult(null);
  }

  function handleFileSelected(f: File) {
    setFile(f);
    setStatus("idle");
    setLoadingStage("extracting");
    setError(null);
    setResult(null);
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.stage === "extracting" || event.stage === "summarizing") {
      setLoadingStage(event.stage);
    } else if (event.stage === "done") {
      setResult(event.result);
      setStatus("success");
    } else if (event.stage === "error") {
      setError(event.error || "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  async function handleSummarize() {
    if (!file) return;
    setStatus("loading");
    setLoadingStage("extracting");
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

      // Validation failures (bad file type, too large, etc.) come back
      // as a single plain JSON error before any stream is opened.
      if (!res.ok) {
        let message = `The server returned an error (status ${res.status}). Please try again in a moment.`;
        try {
          const data = (await res.json()) as ApiErrorResponse;
          if (data.error) message = data.error;
        } catch {
          // keep the default message above
        }
        setError(message);
        setStatus("error");
        return;
      }

      if (!res.body) {
        setError("The server sent back an unexpected response. Please try again.");
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminalEvent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line) as StreamEvent;
            if (event.stage === "done" || event.stage === "error") sawTerminalEvent = true;
            handleStreamEvent(event);
          } catch {
            // Ignore a malformed line rather than failing the whole stream.
          }
        }
      }

      // Handle a final line that arrived without a trailing newline.
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim()) as StreamEvent;
          if (event.stage === "done" || event.stage === "error") sawTerminalEvent = true;
          handleStreamEvent(event);
        } catch {
          // ignore
        }
      }

      if (!sawTerminalEvent) {
        setError("The connection ended before a summary was ready. Please try again.");
        setStatus("error");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <header className="mb-10">
          <div className="flex items-start justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] mb-2">
              pdf · jpg · png → summary
            </p>
            <ThemeToggle />
          </div>
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
                {isProcessing ? STAGE_LABEL[loadingStage] : "Summarize"}
              </button>
            </>
          )}

          {status === "loading" && <LoadingIndicator label={STAGE_LABEL[loadingStage]} />}
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
