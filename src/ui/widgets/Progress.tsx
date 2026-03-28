export function ProgressWidget({ value, max, label }: { value: number; max?: number; label?: string }) {
  const total = max ?? 100;
  const pct = Math.min(100, Math.round((value / total) * 100));

  return (
    <div className="my-3 rounded-xl border border-ink-900/15 bg-surface-tertiary/60 px-4 py-3 max-w-md">
      {label && <div className="text-xs font-medium text-ink-600 mb-2">{label}</div>}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 rounded-full bg-ink-900/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-mono font-semibold text-ink-700">{pct}%</span>
      </div>
    </div>
  );
}
