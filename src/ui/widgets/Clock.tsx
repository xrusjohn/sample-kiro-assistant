import { useState, useEffect } from "react";

export function ClockWidget({ timezone }: { timezone?: string }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined,
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <div className="my-3 inline-flex items-center gap-3 rounded-xl border border-accent/30 bg-white/80 px-5 py-3 shadow-sm">
      <span className="text-2xl">🕐</span>
      <div>
        <div className="text-lg font-mono font-semibold text-gray-800">{fmt.format(time)}</div>
        {timezone && <div className="text-xs text-gray-500">{timezone}</div>}
      </div>
    </div>
  );
}
