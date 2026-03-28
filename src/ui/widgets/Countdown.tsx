import { useState, useEffect } from "react";

export function CountdownWidget({ target, label }: { target: string; label?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const end = new Date(target).getTime();
  const diff = Math.max(0, end - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return (
    <div className="my-3 inline-flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-5 py-3">
      <span className="text-2xl">⏳</span>
      <div>
        {label && <div className="text-xs font-medium text-ink-600 mb-1">{label}</div>}
        <div className="text-lg font-mono font-semibold text-ink-900">
          {diff === 0 ? "🎉 Done!" : `${h}h ${m}m ${s}s`}
        </div>
      </div>
    </div>
  );
}
