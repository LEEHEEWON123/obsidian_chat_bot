export interface AppConfig {
  vaultPath: string;
  cursorApiKey: string;
  cursorModel: string;
  indexInclude: string;
  topK: number;
  recallK: number;
  rerankEnabled: boolean;
  rerankModel: string;
  rerankBatchSize: number;
  rerankMinScore: number;
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
    recallK: Number(process.env.RAG_RECALL_K ?? 50),
    rerankEnabled: process.env.RERANK_ENABLED !== "false",
    rerankModel:
      process.env.RERANK_MODEL ?? "woxpas-ai/bge-reranker-v2-m3-onnx",
    rerankBatchSize: Number(process.env.RERANK_BATCH_SIZE ?? 8),
    rerankMinScore: Number(process.env.RERANK_MIN_SCORE ?? 0),
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
