import { useState, useEffect } from "react";
import { useSendToStore } from "../store/useSendToStore";
import type { ConfigField } from "../../shared/send-to-types";

export function SendToConfigPanel() {
  const activeDestination = useSendToStore((s) => s.activeDestination);
  const destinations = useSendToStore((s) => s.destinations);
  const targetFile = useSendToStore((s) => s.targetFile);
  const sendFile = useSendToStore((s) => s.sendFile);
  const status = useSendToStore((s) => s.status);
  const result = useSendToStore((s) => s.result);
  const closeMenu = useSendToStore((s) => s.closeMenu);
  const configPanelOpen = useSendToStore((s) => s.configPanelOpen);

  const dest = destinations.find((d) => d.id === activeDestination);
  const [params, setParams] = useState<Record<string, string>>({});

  // Reset params when destination changes
  useEffect(() => {
    setParams({});
  }, [activeDestination]);

  if (!configPanelOpen || !dest || !targetFile) return null;

  const fields = dest.configFields;
  const hasRequiredEmpty = fields.some((f) => f.required && !params[f.name]?.trim());

  const handleSend = () => {
    if (status === "in_progress") return;
    sendFile(targetFile.path, dest.id, params);
  };

  const renderField = (field: ConfigField) => {
    const value = params[field.name] || "";
    const onChange = (val: string) => setParams((p) => ({ ...p, [field.name]: val }));

    if (field.type === "select") {
      return (
        <select
          className="w-full rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-800"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (field.type === "textarea") {
      return (
        <textarea
          rows={3}
          className="w-full rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-800 resize-none"
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    return (
      <input
        type={field.type}
        className="w-full rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-800"
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink-900/5 bg-surface p-5 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink-800">
            {dest.icon} Send to {dest.label}
          </h3>
          <button className="text-muted hover:text-ink-700" onClick={closeMenu}>✕</button>
        </div>

        <div className="text-xs text-muted mb-3 truncate">
          📄 {targetFile.name}
        </div>

        {fields.length > 0 ? (
          <div className="flex flex-col gap-3 mb-4">
            {fields.map((field) => (
              <label key={field.name} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">
                  {field.label}{field.required && " *"}
                </span>
                {renderField(field)}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted mb-4">No configuration needed. Click Send to proceed.</p>
        )}

        {result && status === "error" && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600 mb-3">
            {result.message}
          </div>
        )}

        {result && status === "success" && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-600 mb-3">
            ✓ {result.message}
            {result.data?.uri && (
              <div className="mt-1 font-mono text-[11px] select-all">{String(result.data.uri)}</div>
            )}
            {result.data?.url && (
              <a href={String(result.data.url)} target="_blank" rel="noopener" className="mt-1 block text-accent underline">{String(result.data.url)}</a>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            className="rounded-lg border border-ink-900/20 px-4 py-2 text-sm text-ink-700 hover:bg-surface-tertiary"
            onClick={closeMenu}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSend}
            disabled={hasRequiredEmpty || status === "in_progress" || status === "success"}
          >
            {status === "in_progress" ? "Sending..." : status === "error" ? "Retry" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
