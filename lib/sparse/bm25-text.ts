export interface Bm25ChunkFields {
  path: string;
  title: string;
  content: string;
}

export const DENSE_VECTOR_NAME = "dense";
export const SPARSE_VECTOR_NAME = "text";
export const BM25_MODEL = "qdrant/bm25";

export interface Bm25DocumentVector {
  text: string;
  model: typeof BM25_MODEL;
}

/** Text indexed for Qdrant server-side BM25 sparse vectors. */
export function chunkToBm25Text(chunk: Bm25ChunkFields): string {
  const body = chunk.content.replace(/\s+/g, " ").trim();
  return `${chunk.path}\n${chunk.title}\n${body}`.trim();
}

export function bm25Document(text: string): Bm25DocumentVector {
  return {
    text,
    model: BM25_MODEL,
  };
}
