import { getConfig } from "@/lib/config";
import { embedText } from "@/lib/embeddings/local";
import { GraphStore } from "@/lib/graph/store";
import { appendLinkedContextChunks } from "@/lib/rag/note-context";
import { rerankChunks } from "@/lib/rerank/local";
import { type ScoredChunk } from "@/lib/rag/hybrid";
import { extractDatesFromQuery } from "@/lib/rag/query-dates";
import {
  hasPathScope,
  matchesPathScope,
  normalizePathScopeValue,
  type PathScope,
} from "@/lib/rag/path-scope";
import { parseQuery } from "@/lib/rag/query-hints";
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";

export interface RetrievedChunkMeta {
  chunk: IndexedChunk;
  score: number;
  source: "keyword" | "semantic" | "rerank" | "graph" | "note" | "link";
}

export async function retrieveRelevantChunksWithMeta(options: {
  query: string;
  dataDir: string;
  topK: number;
  recallK?: number;
  contextPath?: string;
  rootFolder?: string;
  pathPrefix?: string;
}): Promise<RetrievedChunkMeta[]> {
  const config = getConfig();
  const recallK = options.recallK ?? config.recallK;
  const pathScope: PathScope = {
    rootFolder: normalizePathScopeValue(options.rootFolder),
    pathPrefix: normalizePathScopeValue(options.pathPrefix),
  };

  const store = await VectorStore.load(options.dataDir);
  if (store.getMeta().chunkCount === 0) {
    return [];
  }

  const dates = extractDatesFromQuery(options.query);
  if (dates.length > 0) {
    const dateChunks = await store.findChunksForDates(dates);
    if (dateChunks.length > 0) {
      return dateChunks.slice(0, Math.max(options.topK, dateChunks.length)).map(
        (chunk) => ({
          chunk,
          score: 1,
          source: "semantic" as const,
        }),
      );
    }
  }

  const parsed = parseQuery(options.query);
  const semanticQuery = parsed.semanticQuery || options.query;

  const queryEmbedding = await embedText(semanticQuery);
  const recalled = await store.hybridRecall({
    queryText: semanticQuery,
    queryEmbedding,
    topK: recallK,
    scope: pathScope,
  });

  let candidates: ScoredChunk[] = recalled.map((chunk) => ({
    chunk,
    score: 0,
    source: "semantic",
  }));

  if (hasPathScope(pathScope)) {
    candidates = candidates.filter((item) =>
      matchesPathScope(item.chunk.path, pathScope),
    );
  }

  const graph = await GraphStore.load(options.dataDir);
  const hasGraphContext =
    graph.getMeta().edgeCount > 0 || options.contextPath !== undefined;

  if (hasGraphContext) {
    candidates = await appendLinkedContextChunks({
      store,
      graph,
      candidates,
      contextPath: options.contextPath,
      hops: config.graphExpandHops,
      maxNeighborPaths: config.noteContextMaxPaths,
    });

    if (hasPathScope(pathScope)) {
      candidates = candidates.filter((item) =>
        matchesPathScope(item.chunk.path, pathScope),
      );
    }
  }

  if (candidates.length === 0) return [];

  if (config.rerankEnabled) {
    const reranked = await rerankChunks({
      query: options.query,
      chunks: candidates.map((item) => item.chunk),
      topK: options.topK,
    });

    const relevant = reranked.filter(
      (item) => item.score >= config.rerankMinScore,
    );

    return relevant.map((item) => ({
      chunk: item.chunk,
      score: item.score,
      source: "rerank" as const,
    }));
  }

  return candidates.slice(0, options.topK).map((item) => ({
    chunk: item.chunk,
    score: item.score,
    source: item.source,
  }));
}

export async function retrieveRelevantChunks(options: {
  query: string;
  dataDir: string;
  topK: number;
}): Promise<IndexedChunk[]> {
  const results = await retrieveRelevantChunksWithMeta(options);
  return results.map((item) => item.chunk);
}
