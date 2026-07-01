import { extractDatesFromQuery } from "./query-dates";
import { expandSeedPaths, type GraphFile } from "./graph";
import type { IndexedChunk, SearchResult, StoreFile } from "../types";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function keywordScore(query: string, text: string): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  if (terms.length === 0) return 0;

  const haystack = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) hits++;
  }
  return hits / terms.length;
}

export function parseStore(raw: string): StoreFile | null {
  try {
    return JSON.parse(raw) as StoreFile;
  } catch {
    return null;
  }
}

export function searchLocalStore(options: {
  query: string;
  store: StoreFile;
  topK: number;
}): SearchResult[] {
  const { query, store, topK } = options;
  const dates = extractDatesFromQuery(query);

  let candidates = store.chunks;

  if (dates.length > 0) {
    const matches = store.chunks.filter((chunk) =>
      dates.some((date) => chunk.title.includes(date) || chunk.content.includes(date)),
    );
    if (matches.length > 0) {
      const paths = new Set(matches.map((chunk) => chunk.path));
      candidates = store.chunks.filter((chunk) => paths.has(chunk.path));
    }
  }

  return candidates
    .map((chunk) => ({
      id: chunk.id,
      path: chunk.path,
      title: chunk.title,
      content: chunk.content.slice(0, 400),
      startLine: chunk.startLine,
      score: keywordScore(query, `${chunk.title}\n${chunk.content}`),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function expandLocalWithGraph(options: {
  results: SearchResult[];
  graph: GraphFile;
  store: StoreFile;
  maxAdds?: number;
}): SearchResult[] {
  const { results, graph, store, maxAdds = 8 } = options;
  if (results.length === 0) return results;

  const seen = new Set(results.map((r) => `${r.path}:${r.startLine}`));
  const merged = [...results.map((r) => ({ ...r, source: r.source ?? "semantic" }))];
  const seeds = [...new Set(results.map((r) => r.path))];
  const neighbors = expandSeedPaths(graph, seeds);
  const baseScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  let adds = 0;
  for (const path of neighbors) {
    if (adds >= maxAdds) break;
    const chunk = store.chunks.find((c) => c.path === path);
    if (!chunk) continue;
    const key = `${chunk.path}:${chunk.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      id: chunk.id,
      path: chunk.path,
      title: chunk.title,
      content: chunk.content.slice(0, 400),
      startLine: chunk.startLine,
      score: baseScore * 0.72,
      source: "graph",
    });
    adds++;
  }

  return merged.sort((a, b) => b.score - a.score);
}

export function mergeApiResults(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => b.score - a.score);
}

export function scoreToPercent(score: number): number {
  if (score <= 1) return Math.round(Math.max(0, Math.min(100, score * 100)));
  return Math.round(Math.max(0, Math.min(100, score * 100)));
}

export function normalizePathForVault(path: string): string {
  if (path.startsWith("notion://")) {
    return path.replace(/^notion:\/\//, "");
  }
  return path;
}

export function chunkToResult(chunk: IndexedChunk, score: number): SearchResult {
  return {
    id: chunk.id,
    path: chunk.path,
    title: chunk.title,
    content: chunk.content.slice(0, 400),
    startLine: chunk.startLine,
    score,
  };
}

export { cosineSimilarity };
