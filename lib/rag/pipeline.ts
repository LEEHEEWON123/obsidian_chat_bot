import { getConfig } from "@/lib/config";
import { embedText } from "@/lib/embeddings/local";
import { GraphStore } from "@/lib/graph/store";
import { appendLinkedContextChunks } from "@/lib/rag/note-context";
import { rerankChunks } from "@/lib/rerank/local";
import { type ScoredChunk } from "@/lib/rag/hybrid";
import {
  chunkMatchesDates,
  extractDatesFromQuery,
} from "@/lib/rag/query-dates";
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

  // Always run hybrid (dense + BM25 → RRF). Dates are a soft prefer among
  // recall hits — never a short-circuit that dumps score=1 date-only matches.
  const dates = extractDatesFromQuery(options.query);
  const parsed = parseQuery(options.query);
  const semanticQuery = parsed.semanticQuery || options.query;
  const rawQuery = options.query.trim() || semanticQuery;

  const queryEmbedding = await embedText(semanticQuery);
  const recalled = await store.hybridRecall({
    // Keep raw query for BM25 so ISO dates like 2024-01-15 stay intact
    // (parseQuery splits on "-" into year/month/day tokens).
    queryText: rawQuery,
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

  if (dates.length > 0) {
    const dated = candidates.filter((item) =>
      chunkMatchesDates(item.chunk, dates),
    );
    if (dated.length > 0) {
      candidates = dated;
    }
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
