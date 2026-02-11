import rawModels from "./models.json" with { type: "json" };

export type ModelInfo = {
  id: string;
  label: string;
  price: string;
  description: string;
};

export const DEFAULT_MODEL_ID = "claude-sonnet-4.5";

export const models = rawModels as ModelInfo[];
