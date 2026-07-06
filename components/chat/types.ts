export interface Source {
  path: string;
  title: string;
  startLine: number;
  pageNumber?: number;
  content: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

export interface HealthStatus {
  chunkCount: number;
  indexedAt: string | null;
  vaultPathConfigured: boolean;
  cursorApiKeyConfigured: boolean;
}

export type PanelView =
  | "loading"
  | "health_error"
  | "config_missing"
  | "no_index"
  | "indexing"
  | "chat";

export function resolvePanelView(options: {
  healthLoading: boolean;
  healthError: string | null;
  health: HealthStatus | null;
  indexing: boolean;
}): PanelView {
  if (options.healthLoading) return "loading";
  if (options.healthError || !options.health) return "health_error";
  if (
    !options.health.cursorApiKeyConfigured ||
    !options.health.vaultPathConfigured
  ) {
    return "config_missing";
  }
  if (options.indexing) return "indexing";
  if (!options.health.chunkCount) return "no_index";
  return "chat";
}
