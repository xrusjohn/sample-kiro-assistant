import type { MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

export default function MDContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={{
        a: ({ href, children, node: _node, ...anchorProps }) => {
          const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
            if (!href) return;
            event.preventDefault();
            window.electron?.openExternalUrl?.(href);
          };

          return (
            <a
              href={href}
              onClick={handleClick}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline decoration-1 underline-offset-2 hover:opacity-80"
              {...anchorProps}
            >
              {children}
            </a>
          );
        },
        h1: (props) => <h1 className="mt-4 text-xl font-semibold text-ink-900" {...props} />,
        h2: (props) => <h2 className="mt-4 text-lg font-semibold text-ink-900" {...props} />,
        h3: (props) => <h3 className="mt-3 text-base font-semibold text-ink-800" {...props} />,
        p: (props) => <p className="mt-2 text-base leading-relaxed text-ink-700" {...props} />,
        ul: (props) => <ul className="mt-2 ml-4 grid list-disc gap-1" {...props} />,
        ol: (props) => <ol className="mt-2 ml-4 grid list-decimal gap-1" {...props} />,
        li: (props) => <li className="min-w-0 text-ink-700" {...props} />,
        strong: (props) => <strong className="text-ink-900 font-semibold" {...props} />,
        em: (props) => <em className="text-ink-800" {...props} />,
        pre: (props) => (
          <pre
            className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded-xl border border-ink-900/20 bg-white p-3 text-sm text-ink-400"
            {...props}
          />
        ),
        table: (props) => (
          <table className="mt-3 w-full table-auto border border-ink-900/20 text-sm text-ink-700" {...props} />
        ),
        thead: (props) => <thead className="bg-surface-tertiary text-ink-900" {...props} />,
        th: (props) => (
          <th
            className="border-b border-r border-ink-900/20 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide"
            {...props}
          />
        ),
        tbody: (props) => <tbody className="bg-surface" {...props} />,
        td: (props) => (
          <td className="border-b border-r border-ink-900/20 px-3 py-2 text-left align-top" {...props} />
        ),
        code: (props) => {
          const { children, className, ...rest } = props;
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !String(children).includes("\n");

          return isInline ? (
            <code className="rounded bg-white px-1.5 py-0.5 text-ink-400 font-mono text-base" {...rest}>
              {children}
            </code>
          ) : (
            <code className={`${className} font-mono`} {...rest}>
              {children}
            </code>
          );
        }
      }}
    >
      {String(text ?? "")}
    </ReactMarkdown>
  )
}
