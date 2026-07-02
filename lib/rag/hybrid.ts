import type { IndexedChunk } from "@/lib/vector-store/store";

export interface ScoredChunk {
  chunk: IndexedChunk;
  score: number;
  source: "keyword" | "semantic";
}

export function mergeHybridResults(options: {
  keyword: ScoredChunk[];
  semantic: ScoredChunk[];
  limit: number;
}): ScoredChunk[] {
  const { keyword, semantic, limit } = options;
  const seen = new Set<string>();
  const merged: ScoredChunk[] = [];

  const add = (item: ScoredChunk) => {
    const key = `${item.chunk.path}:${item.chunk.startLine}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  for (const item of keyword) add(item);
  for (const item of semantic) add(item);

  return merged.sort((a, b) => b.score - a.score).slice(0, limit);
}
