import type { IndexedChunk } from "@/lib/vector-store/store";

const MAX_PASSAGE_CHARS = 600;

/** Text fed to the cross-encoder reranker (path + title + body snippet). */
export function chunkToPassage(chunk: IndexedChunk): string {
  const body = chunk.content.replace(/\s+/g, " ").trim().slice(0, MAX_PASSAGE_CHARS);
  return `${chunk.path}\n${chunk.title}\n${body}`.trim();
}
