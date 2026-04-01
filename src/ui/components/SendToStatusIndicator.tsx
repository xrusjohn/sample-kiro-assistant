import { useSendToStore } from "../store/useSendToStore";

export function SendToStatusIndicator() {
  const status = useSendToStore((s) => s.status);
  const result = useSendToStore((s) => s.result);
  const activeDestination = useSendToStore((s) => s.activeDestination);
  const destinations = useSendToStore((s) => s.destinations);
  const sendFile = useSendToStore((s) => s.sendFile);
  const targetFile = useSendToStore((s) => s.targetFile);

  if (status === "idle") return null;

  const destLabel = destinations.find((d) => d.id === activeDestination)?.label || activeDestination;

  if (status === "in_progress") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-amber-600">
        <span className="animate-spin">⟳</span>
        Sending to {destLabel}...
      </div>
    );
  }

  if (status === "success" && result) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-emerald-600">
        <span>✓</span>
        {result.message}
      </div>
    );
  }

  if (status === "error" && result) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-600">
        <span>✗</span>
        <span className="flex-1">{result.message}</span>
        {targetFile && activeDestination && (
          <button
            className="text-accent hover:underline"
            onClick={() => sendFile(targetFile.path, activeDestination, {})}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return null;
}
