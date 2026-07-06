import { GraphStore } from "@/lib/graph/store";
import type { ScoredChunk } from "@/lib/rag/hybrid";
import type { IndexedChunk } from "@/lib/vector-store/store";
import { VectorStore } from "@/lib/vector-store/store";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function chunkKey(chunk: IndexedChunk): string {
  return `${normalizePath(chunk.path)}:${chunk.startLine}`;
}

/** Add current-note and 1-hop hyperlink neighbor chunks to the recall pool. */
export async function appendLinkedContextChunks(options: {
  store: VectorStore;
  graph: GraphStore;
  candidates: ScoredChunk[];
  contextPath?: string;
  hops: number;
  maxNeighborPaths: number;
}): Promise<ScoredChunk[]> {
  const { store, graph, candidates, contextPath, hops, maxNeighborPaths } =
    options;

  if (graph.getMeta().edgeCount === 0 && !contextPath) {
    return candidates;
  }

  const seedPaths = new Set<string>();
  const normalizedContext = contextPath
    ? normalizePath(contextPath)
    : undefined;

  if (normalizedContext) {
    seedPaths.add(normalizedContext);
  }

  for (const item of candidates.slice(0, 5)) {
    seedPaths.add(normalizePath(item.chunk.path));
  }

  if (seedPaths.size === 0) {
    return candidates;
  }

  const neighborPaths = graph
    .expandNodes([...seedPaths], hops)
    .slice(0, maxNeighborPaths);

  const lookupPaths = [
    ...new Set([
      ...(normalizedContext ? [normalizedContext] : []),
      ...neighborPaths,
    ]),
  ];

  if (lookupPaths.length === 0) {
    return candidates;
  }

  const contextChunks = await store.getChunksByPaths(lookupPaths);
  const seen = new Set(candidates.map((item) => chunkKey(item.chunk)));
  const merged = [...candidates];

  for (const chunk of contextChunks) {
    const key = chunkKey(chunk);
    if (seen.has(key)) continue;
    seen.add(key);

    const path = normalizePath(chunk.path);
    const isNote = normalizedContext !== undefined && path === normalizedContext;

    merged.push({
      chunk,
      score: isNote ? 0.85 : 0.72,
      source: isNote ? "note" : "link",
    });
  }

  return merged;
}
