export interface IndexedChunk {
  id: string;
  path: string;
  title: string;
  content: string;
  startLine: number;
  embedding: number[];
}

export interface StoreMeta {
  indexedAt: string;
  chunkCount: number;
}

export interface StoreFile {
  meta: StoreMeta;
  chunks: IndexedChunk[];
}

export interface SearchResult {
  id: string;
  path: string;
  title: string;
  content: string;
  startLine: number;
  score: number;
  source?: "semantic" | "graph";
}

export interface CompanyRagSettings {
  apiBaseUrl: string;
  topK: number;
  indexFolder: string;
}

export const DEFAULT_SETTINGS: CompanyRagSettings = {
  apiBaseUrl: "http://localhost:3000",
  topK: 8,
  indexFolder: ".company-rag",
};
