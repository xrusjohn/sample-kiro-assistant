export interface ConfigField {
  name: string;
  label: string;
  type: "text" | "email" | "textarea" | "select";
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface DestinationInfo {
  id: string;
  label: string;
  icon: string;
  supportedFileTypes: "text" | "binary" | "all";
  configFields: ConfigField[];
}

export interface SendToRequest {
  filePath: string;
  destination: string;
  params: Record<string, string>;
}

export interface SendToResponse {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export type SendToStatus = "idle" | "in_progress" | "success" | "error";

export const TEXT_EXTENSIONS = new Set([
  "txt","md","py","js","ts","tsx","jsx","json","xml","html","css",
  "scss","yaml","yml","sh","bash","c","cpp","h","java","go","rs",
  "rb","php","sql","vue","svelte","toml","ini","csv","log","graphql",
  "markdown","less","zsh","fish","conf","cfg","env"
]);

export function isTextFile(extension: string): boolean {
  return TEXT_EXTENSIONS.has(extension.toLowerCase());
}
