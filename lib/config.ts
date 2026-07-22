export interface AppConfig {
  vaultPath: string;
  cursorApiKey: string;
  cursorModel: string;
  indexInclude: string;
  pdfInclude: string;
  pdfIndexDir: string;
  pdfHybrid: string;
  pdfHybridUrl: string;
  pdfHybridMode: string;
  docxInclude: string;
  docxIndexDir: string;
  topK: number;
  recallK: number;
  rerankEnabled: boolean;
  rerankModel: string;
  rerankBatchSize: number;
  rerankMinScore: number;
  graphExpandHops: number;
  noteContextMaxPaths: number;
  dataDir: string;
  qdrantUrl: string;
  qdrantCollection: string;
}

function appendIndexDir(base: string, indexDir: string): string {
  const normalized = indexDir.replace(/\\/g, "/").replace(/\/$/, "");
  if (!normalized) return base;

  const pattern = `${normalized}/**/*.md`;
  if (base.includes(normalized)) return base;
  if (!base.trim()) return pattern;
  return `${base},${pattern}`;
}

export function getConfig(): AppConfig {
  const pdfIndexDir = process.env.PDF_INDEX_DIR ?? ".pdf-index";
  const docxIndexDir = process.env.DOCX_INDEX_DIR ?? ".docx-index";
  let indexInclude = process.env.INDEX_INCLUDE ?? "**/*.md";
  if (process.env.PDF_INDEX_ENABLED !== "false") {
    indexInclude = appendIndexDir(indexInclude, pdfIndexDir);
  }
  if (process.env.DOCX_INDEX_ENABLED !== "false") {
    indexInclude = appendIndexDir(indexInclude, docxIndexDir);
  }

  return {
    vaultPath: process.env.VAULT_PATH ?? "",
    cursorApiKey: process.env.CURSOR_API_KEY ?? "",
    cursorModel: process.env.CURSOR_MODEL ?? "composer-2.5",
    indexInclude,
    pdfInclude: process.env.PDF_INCLUDE ?? "**/*.pdf",
    pdfIndexDir,
    pdfHybrid: process.env.PDF_HYBRID ?? "",
    pdfHybridUrl: process.env.PDF_HYBRID_URL ?? "",
    pdfHybridMode: process.env.PDF_HYBRID_MODE ?? "full",
    docxInclude: process.env.DOCX_INCLUDE ?? "**/*.docx",
    docxIndexDir,
    topK: Number(process.env.RAG_TOP_K ?? 5),
    recallK: Number(process.env.RAG_RECALL_K ?? 50),
    rerankEnabled: process.env.RERANK_ENABLED !== "false",
    rerankModel:
      process.env.RERANK_MODEL ?? "woxpas-ai/bge-reranker-v2-m3-onnx",
    rerankBatchSize: Number(process.env.RERANK_BATCH_SIZE ?? 8),
    rerankMinScore: Number(process.env.RERANK_MIN_SCORE ?? 0),
    graphExpandHops: Number(process.env.GRAPH_EXPAND_HOPS ?? 1),
    noteContextMaxPaths: Number(process.env.NOTE_CONTEXT_MAX_PATHS ?? 10),
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
