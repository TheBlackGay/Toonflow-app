export type MediaProviderModel = {
  id: string;
  label: string;
  type: "text" | "image" | "video" | "audio";
  [key: string]: unknown;
};

export type MediaProviderRule = {
  type: string;
  field: string;
  title: string;
  value?: unknown;
  props?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MediaProvider = {
  fileName: string;
  id: string;
  label: string;
  version?: string;
  readme?: string;
  rules?: MediaProviderRule[];
  modelsUrl?: string;
  models: MediaProviderModel[];
  revision: string;
  loadError?: string;
};
