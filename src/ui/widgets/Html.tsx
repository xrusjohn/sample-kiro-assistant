import { useRef, useEffect, useState } from "react";

export function HtmlWidget({ html, height }: { html: string; height?: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [autoHeight, setAutoHeight] = useState(height ?? 300);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #333; }
      * { box-sizing: border-box; }
    </style></head><body>${html}</body></html>`);
    doc.close();
    // Auto-size after render
    setTimeout(() => {
      const h = doc.body?.scrollHeight;
      if (h && !height) setAutoHeight(Math.min(h + 24, 600));
    }, 100);
  }, [html, height]);

  return (
    <div className="my-3 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin"
        className="w-full border-0 bg-white"
        style={{ height: autoHeight }}
        title="HTML Widget"
      />
    </div>
  );
}
