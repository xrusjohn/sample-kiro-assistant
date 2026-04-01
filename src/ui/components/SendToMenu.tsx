import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useSendToStore } from "../store/useSendToStore";
import { isTextFile } from "../../shared/send-to-types";
import type { CreatedFile } from "../types";

interface SendToMenuProps {
  file: CreatedFile;
  disabled?: boolean;
  content?: string | null;
}

export function SendToMenu({ file, disabled, content }: SendToMenuProps) {
  const destinations = useSendToStore((s) => s.destinations);
  const openMenu = useSendToStore((s) => s.openMenu);
  const selectDestination = useSendToStore((s) => s.selectDestination);
  const status = useSendToStore((s) => s.status);

  const isNotFound = content === "__not_found__";
  const isDisabled = disabled || isNotFound || status === "in_progress";
  const fileIsText = isTextFile(file.extension);

  return (
    <DropdownMenu.Root onOpenChange={(open) => { if (open) openMenu(file); }}>
      <DropdownMenu.Trigger asChild>
        <button
          className="rounded-lg p-2 text-ink-500 hover:bg-ink-900/10 hover:text-ink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={isDisabled}
          title={isNotFound ? "File not available" : status === "in_progress" ? "Send in progress..." : "Send To"}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="z-50 min-w-[200px] rounded-xl border border-ink-900/10 bg-surface-secondary p-1 shadow-lg" sideOffset={8}>
          <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Send To
          </DropdownMenu.Label>
          {destinations.map((dest) => {
            const supported = dest.supportedFileTypes === "all" || (dest.supportedFileTypes === "text" && fileIsText) || (dest.supportedFileTypes === "binary" && !fileIsText);
            return (
              <DropdownMenu.Item
                key={dest.id}
                disabled={!supported}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary disabled:opacity-40 disabled:cursor-not-allowed"
                onSelect={() => selectDestination(dest.id)}
              >
                <span>{dest.icon}</span>
                <span>{dest.label}</span>
                {!supported && <span className="ml-auto text-[10px] text-muted">text only</span>}
              </DropdownMenu.Item>
            );
          })}
          {destinations.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted">No destinations available</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
