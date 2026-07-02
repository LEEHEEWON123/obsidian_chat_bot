export interface AppConfig {
  vaultPath: string;
  cursorApiKey: string;
  cursorModel: string;
  indexInclude: string;
  topK: number;
  dataDir: string;
  qdrantUrl: string;
  qdrantCollection: string;
}

export function getConfig(): AppConfig {
  return {
    vaultPath: process.env.VAULT_PATH ?? "",
    cursorApiKey: process.env.CURSOR_API_KEY ?? "",
    cursorModel: process.env.CURSOR_MODEL ?? "composer-2.5",
    indexInclude: process.env.INDEX_INCLUDE ?? "**/*.md",
    topK: Number(process.env.RAG_TOP_K ?? 5),
    dataDir: process.env.DATA_DIR ?? "data",
    qdrantUrl: process.env.QDRANT_URL ?? "http://127.0.0.1:6333",
    qdrantCollection: process.env.QDRANT_COLLECTION ?? "company-rag",
  };
}

export function assertConfig(config: AppConfig): void {
  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not set");
  }
  if (!config.cursorApiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }
}
