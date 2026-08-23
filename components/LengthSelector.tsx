"use client";

import { SummaryLength } from "@/lib/types";

const OPTIONS: { value: SummaryLength; label: string; hint: string }[] = [
  { value: "short", label: "Short", hint: "2-3 sentences" },
  { value: "medium", label: "Medium", hint: "1-2 paragraphs" },
  { value: "long", label: "Long", hint: "3-5 paragraphs" },
];

interface LengthSelectorProps {
  value: SummaryLength;
  onChange: (v: SummaryLength) => void;
  disabled?: boolean;
}

export function LengthSelector({ value, onChange, disabled }: LengthSelectorProps) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] mb-2">
        Summary length
      </p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-50 ${
                active
                  ? "border-[var(--highlighter-dark)] bg-[var(--highlighter)]"
                  : "border-[var(--border)] bg-[var(--paper-card)] hover:border-[var(--ink-soft)]"
              }`}
            >
              <span
                className={`block font-display text-sm sm:text-base ${
                  active ? "text-[var(--highlighter-text)]" : "text-[var(--ink)]"
                }`}
              >
                {opt.label}
              </span>
              <span
                className={`block font-mono text-[10px] sm:text-xs mt-0.5 ${
                  active ? "text-[var(--highlighter-text)] opacity-80" : "text-[var(--muted)]"
                }`}
              >
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
