export function LoadingIndicator({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--paper-card)] p-8 flex flex-col items-center gap-4">
      <div className="relative h-16 w-12 rounded-sm border border-[var(--border)] bg-[var(--paper)] overflow-hidden">
        <div className="scan-line absolute left-0 right-0 top-0 h-[3px] bg-[var(--highlighter-dark)]" />
      </div>
      <p className="font-mono text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-bg)] px-4 py-3 flex gap-3 items-start"
    >
      <span className="font-mono text-xs font-bold text-[var(--error)] mt-0.5">!</span>
      <p className="text-sm text-[var(--error)] leading-relaxed">{message}</p>
    </div>
  );
}
