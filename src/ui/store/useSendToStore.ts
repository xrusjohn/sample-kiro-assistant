import { create } from "zustand";
import type { DestinationInfo, SendToResponse, SendToStatus } from "../../shared/send-to-types";
import type { CreatedFile } from "../types";

const BASE = window.location.origin;

interface SendToState {
  status: SendToStatus;
  activeDestination: string | null;
  result: SendToResponse | null;
  destinations: DestinationInfo[];
  menuOpen: boolean;
  configPanelOpen: boolean;
  targetFile: CreatedFile | null;

  fetchDestinations: () => Promise<void>;
  openMenu: (file: CreatedFile) => void;
  closeMenu: () => void;
  selectDestination: (id: string) => void;
  sendFile: (filePath: string, destination: string, params: Record<string, string>) => Promise<void>;
  reset: () => void;
}

export const useSendToStore = create<SendToState>((set, get) => ({
  status: "idle",
  activeDestination: null,
  result: null,
  destinations: [],
  menuOpen: false,
  configPanelOpen: false,
  targetFile: null,

  fetchDestinations: async () => {
    try {
      const res = await fetch(`${BASE}/api/files/send-to/destinations`);
      const data = await res.json();
      set({ destinations: Array.isArray(data) ? data : [] });
    } catch {
      set({ destinations: [] });
    }
  },

  openMenu: (file) => {
    set({ targetFile: file, menuOpen: true, configPanelOpen: false, status: "idle", result: null });
    get().fetchDestinations();
  },

  closeMenu: () => {
    set({ menuOpen: false, configPanelOpen: false, activeDestination: null });
  },

  selectDestination: (id) => {
    set({ activeDestination: id, configPanelOpen: true });
  },

  sendFile: async (filePath, destination, params) => {
    set({ status: "in_progress", result: null });
    try {
      const res = await fetch(`${BASE}/api/files/send-to`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, destination, params }),
      });
      const data: SendToResponse = await res.json();

      // Special handling for clipboard — write to browser clipboard
      if (destination === "clipboard" && data.success && data.data?.content) {
        try {
          await navigator.clipboard.writeText(data.data.content as string);
        } catch {
          set({ status: "error", result: { success: false, message: "Clipboard access denied. Try using HTTPS or check browser permissions." } });
          return;
        }
      }

      set({
        status: data.success ? "success" : "error",
        result: data,
        configPanelOpen: !data.success, // keep panel open on error for retry
      });

      // Auto-dismiss success after 5 seconds
      if (data.success) {
        setTimeout(() => {
          const current = get();
          if (current.status === "success") {
            set({ status: "idle", result: null, menuOpen: false, configPanelOpen: false });
          }
        }, 5000);
      }
    } catch (err: any) {
      set({
        status: "error",
        result: { success: false, message: `Network error: ${err.message}` },
      });
    }
  },

  reset: () => {
    set({ status: "idle", activeDestination: null, result: null, menuOpen: false, configPanelOpen: false, targetFile: null });
  },
}));
