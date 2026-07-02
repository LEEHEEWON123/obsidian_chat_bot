import { getConfig } from "@/lib/config";
import { embedText } from "@/lib/embeddings/local";
import { rerankChunks } from "@/lib/rerank/local";
import { GraphStore } from "@/lib/graph/store";
import { expandResultsWithGraph } from "@/lib/rag/graph-expand";
import { mergeHybridResults, type ScoredChunk } from "@/lib/rag/hybrid";
import { extractDatesFromQuery } from "@/lib/rag/query-dates";
import {
  matchesRootFolder,
  parseQuery,
  scoreKeywordMatch,
} from "@/lib/rag/query-hints";
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RetrievedSource {
  path: string;
  title: string;
  startLine: number;
  content: string;
}

export const SOURCE_SNIPPET_MAX = 400;

export interface RetrievedChunkMeta {
  chunk: IndexedChunk;
  score: number;
  source: "keyword" | "semantic" | "rerank" | "graph";
}

function chunkFilePath(chunk: IndexedChunk): string {
  return chunk.path.replace(/\\/g, "/");
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export async function retrieveRelevantChunksWithMeta(options: {
  query: string;
  dataDir: string;
  topK: number;
  recallK?: number;
}): Promise<RetrievedChunkMeta[]> {
  const config = getConfig();
  const recallK = options.recallK ?? config.recallK;

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
  const folderHints = parsed.folderHints;

  const keywordChunks =
    parsed.terms.length > 0
      ? await store.findChunksByKeywords({
          terms: parsed.terms,
          rootFolders: folderHints,
          limit: recallK,
        })
      : [];

  const keywordScored: ScoredChunk[] = keywordChunks.map((chunk) => ({
    chunk,
    score: scoreKeywordMatch(chunk, parsed.terms),
    source: "keyword",
  }));

  const queryEmbedding = await embedText(semanticQuery);
  const semanticFetchK =
    folderHints.length > 0 ? Math.min(recallK * 2, 100) : recallK;
  let semanticChunks = await store.search(queryEmbedding, semanticFetchK);

  if (folderHints.length > 0) {
    semanticChunks = semanticChunks.filter((chunk) =>
      matchesRootFolder(chunk.path, folderHints),
    );
  }

  const semanticScored: ScoredChunk[] = semanticChunks.map((chunk) => ({
    chunk,
    score: dot(queryEmbedding, chunk.embedding),
    source: "semantic",
  }));

  const candidates = mergeHybridResults({
    keyword: keywordScored,
    semantic: semanticScored,
    limit: recallK,
  });

  if (candidates.length === 0) return [];

  if (config.rerankEnabled) {
    const reranked = await rerankChunks({
      query: options.query,
      chunks: candidates.map((item) => item.chunk),
      topK: options.topK,
    });

    return reranked.map((item) => ({
      chunk: item.chunk,
      score: item.score,
      source: "rerank" as const,
    }));
  }

  const graph = await GraphStore.load(options.dataDir);
  if (graph.getMeta().edgeCount === 0) {
    return candidates.slice(0, options.topK).map((item) => ({
      chunk: item.chunk,
      score: item.score,
      source: item.source,
    }));
  }

  const seedPaths = [
    ...new Set(candidates.map((item) => chunkFilePath(item.chunk))),
  ];
  const neighborPaths = graph.expandNodes(seedPaths, 1);
  const lookupPaths = [...new Set([...seedPaths, ...neighborPaths])];
  const lookupChunks = await store.getChunksByPaths(lookupPaths);

  return expandResultsWithGraph({
    semanticResults: candidates,
    graph,
    allChunks: lookupChunks,
    maxGraphAdds: options.topK,
  })
    .slice(0, options.topK)
    .map((item) => ({
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

export function buildRagPrompt(options: {
  question: string;
  chunks: IndexedChunk[];
  history?: ChatMessage[];
}): string {
  const context =
    options.chunks.length > 0
      ? options.chunks
          .map(
            (chunk, index) =>
              `[Source ${index + 1}: ${chunk.path}${chunk.startLine ? `#L${chunk.startLine}` : ""}]\n${chunk.content}`,
          )
          .join("\n\n---\n\n")
      : "No indexed documents matched this question.";

  const historyText =
    options.history && options.history.length > 0
      ? options.history
          .slice(-6)
          .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
          .join("\n")
      : "";

  return [
    "You are a company knowledge assistant.",
    "Answer using ONLY the CONTEXT excerpts below from the indexed Obsidian vault.",
    "",
    "Rules:",
    "- Extract and explain concrete details from the excerpts (steps, settings, values, procedures).",
    "- Paraphrase or quote the relevant parts of the CONTEXT in your answer.",
    "- Do NOT respond with only a list of file paths or document titles.",
    "- When helpful, cite source paths inline.",
    "- If the CONTEXT is insufficient, say you do not have enough information.",
    "- Respond in the same language as the user's question.",
    "",
    "CONTEXT:",
    context,
    historyText ? `\nRECENT HISTORY:\n${historyText}` : "",
    "",
    `USER QUESTION:\n${options.question}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function toSources(
  chunks: IndexedChunk[],
  maxContentLength = SOURCE_SNIPPET_MAX,
): RetrievedSource[] {
  const seen = new Set<string>();
  const sources: RetrievedSource[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.path}:${chunk.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      path: chunk.path,
      title: chunk.title,
      startLine: chunk.startLine,
      content: chunk.content.slice(0, maxContentLength),
    });
  }

  return sources;
}

export function toSourcesFromMeta(
  items: RetrievedChunkMeta[],
  maxContentLength = SOURCE_SNIPPET_MAX,
): RetrievedSource[] {
  return toSources(
    items.map((item) => item.chunk),
    maxContentLength,
  );
}
