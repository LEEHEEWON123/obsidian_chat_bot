import type { IndexedChunk } from "@/lib/vector-store/store";
import type { GraphStore } from "@/lib/graph/store";

export interface ScoredChunk {
  chunk: IndexedChunk;
  score: number;
  source: "semantic" | "graph";
}

function chunkFilePath(chunk: IndexedChunk): string {
  return chunk.path.replace(/\\/g, "/");
}

function bestChunkForPath(
  path: string,
  chunksByPath: Map<string, IndexedChunk[]>,
): IndexedChunk | null {
  const list = chunksByPath.get(path);
  if (!list?.length) return null;
  return list[0];
}

export function expandResultsWithGraph(options: {
  semanticResults: ScoredChunk[];
  graph: GraphStore;
  allChunks: IndexedChunk[];
  maxGraphAdds?: number;
}): ScoredChunk[] {
  const { semanticResults, graph, allChunks, maxGraphAdds = 8 } = options;

  if (semanticResults.length === 0) return [];

  const chunksByPath = new Map<string, IndexedChunk[]>();
  for (const chunk of allChunks) {
    const key = chunkFilePath(chunk);
    const list = chunksByPath.get(key) ?? [];
    list.push(chunk);
    chunksByPath.set(key, list);
  }

  const seen = new Set<string>();
  const merged: ScoredChunk[] = [];

  for (const item of semanticResults) {
    const key = `${item.chunk.path}:${item.chunk.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  const seedPaths = [
    ...new Set(semanticResults.map((item) => chunkFilePath(item.chunk))),
  ];
  const neighborPaths = graph.expandNodes(seedPaths, 1);
  const baseScore =
    semanticResults.reduce((sum, item) => sum + item.score, 0) /
    semanticResults.length;

  let graphAdds = 0;
  for (const neighborPath of neighborPaths) {
    if (graphAdds >= maxGraphAdds) break;

    const chunk = bestChunkForPath(neighborPath, chunksByPath);
    if (!chunk) continue;

    const key = `${chunk.path}:${chunk.startLine}`;
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push({
      chunk,
      score: baseScore * 0.72,
      source: "graph",
    });
    graphAdds++;
  }

  return merged.sort((a, b) => b.score - a.score);
}

export function chunksToScored(chunks: IndexedChunk[], score = 0.5): ScoredChunk[] {
  return chunks.map((chunk) => ({ chunk, score, source: "semantic" as const }));
}
