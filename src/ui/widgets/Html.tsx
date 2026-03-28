import { useRef, useEffect, useState } from "react";

export function HtmlWidget({ html, height }: { html: string; height?: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [autoHeight, setAutoHeight] = useState(height ?? 500);

  // If content is a file path, serve via API; otherwise use srcdoc
  const trimmed = html.trim();
  const isFilePath = /^\/[\w\/-]+\.html$/i.test(trimmed);
  const src = isFilePath ? `/api/files?path=${encodeURIComponent(trimmed)}` : undefined;

  const isFullDoc = /^\s*<!DOCTYPE|^\s*<html/i.test(trimmed);
  const srcdoc = !isFilePath
    ? (isFullDoc ? trimmed : `<!DOCTYPE html><html><head><style>body{margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#333}*{box-sizing:border-box}</style></head><body>${trimmed}</body></html>`)
    : undefined;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      setTimeout(() => {
        try {
          const h = iframe.contentDocument?.body?.scrollHeight;
          if (h && !height) setAutoHeight(Math.min(h + 24, 800));
        } catch { /* cross-origin, ignore */ }
      }, 300);
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [src, srcdoc, height]);

  return (
    <div className="my-3 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <iframe
        ref={iframeRef}
        {...(src ? { src } : { srcDoc: srcdoc })}
        sandbox="allow-scripts allow-same-origin"
        className="w-full border-0"
        style={{ height: autoHeight, transition: "height 0.2s ease" }}
        title="HTML Widget"
      />
    </div>
  );
}
