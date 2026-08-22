"use client";

import { useCallback, useRef, useState } from "react";
import { ACCEPTED_MIME_TYPES, MAX_FILE_SIZE_MB } from "@/lib/types";

interface UploadAreaProps {
  file: File | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function UploadArea({ file, onFileSelected, onClear, disabled }: UploadAreaProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      onFileSelected(fileList[0]);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  if (file) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--paper-card)] px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--paper)] font-mono text-xs text-[var(--ink-soft)]">
            {file.type === "application/pdf" ? "PDF" : "IMG"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm text-[var(--ink)]">{file.name}</p>
            <p className="text-xs text-[var(--muted)] font-mono">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="shrink-0 text-sm text-[var(--muted)] hover:text-[var(--error)] transition-colors disabled:opacity-40"
          aria-label="Remove file"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="paper-stack">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-2xl border-2 border-dashed bg-[var(--paper-card)] px-6 py-12 text-center transition-colors sm:px-10 sm:py-16 ${
          isDragActive ? "border-[var(--highlighter-dark)] bg-[#fbfced]" : "border-[var(--border)]"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="font-display text-lg sm:text-xl text-[var(--ink)]">
          Drop a document here, or{" "}
          <span className="underline decoration-[var(--highlighter-dark)] decoration-2 underline-offset-4">
            choose a file
          </span>
        </p>
        <p className="mt-3 font-mono text-xs text-[var(--muted)]">
          PDF · JPG · PNG · WEBP — up to {MAX_FILE_SIZE_MB}MB
        </p>
      </div>
    </div>
  );
}
