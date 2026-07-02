import { embedText } from "@/lib/embeddings/local";
import { GraphStore } from "@/lib/graph/store";
import { expandResultsWithGraph } from "@/lib/rag/graph-expand";
import { extractDatesFromQuery } from "@/lib/rag/query-dates";
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RetrievedSource {
  path: string;
  title: string;
  startLine: number;
}

function chunkFilePath(chunk: IndexedChunk): string {
  return chunk.path.replace(/\\/g, "/");
}

export async function retrieveRelevantChunks(options: {
  query: string;
  dataDir: string;
  topK: number;
}): Promise<IndexedChunk[]> {
  const store = await VectorStore.load(options.dataDir);
  if (store.getMeta().chunkCount === 0) {
    return [];
  }

  const dates = extractDatesFromQuery(options.query);
  if (dates.length > 0) {
    const dateChunks = await store.findChunksForDates(dates);
    if (dateChunks.length > 0) {
      return dateChunks.slice(0, Math.max(options.topK, dateChunks.length));
    }
  }

  const queryEmbedding = await embedText(options.query);
  const semantic = await store.search(queryEmbedding, options.topK);

  const graph = await GraphStore.load(options.dataDir);
  if (graph.getMeta().edgeCount === 0) {
    return semantic;
  }

  const rescored = semantic.map((chunk) => ({
    chunk,
    score: dot(queryEmbedding, chunk.embedding),
    source: "semantic" as const,
  }));

  const seedPaths = [...new Set(semantic.map((chunk) => chunkFilePath(chunk)))];
  const neighborPaths = graph.expandNodes(seedPaths, 1);
  const lookupPaths = [...new Set([...seedPaths, ...neighborPaths])];
  const lookupChunks = await store.getChunksByPaths(lookupPaths);

  return expandResultsWithGraph({
    semanticResults: rescored,
    graph,
    allChunks: lookupChunks,
    maxGraphAdds: options.topK,
  }).map((item) => item.chunk);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
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
    "Answer ONLY using the provided context from the indexed Obsidian vault.",
    "If the context is insufficient, say you do not have enough information.",
    "Respond in the same language as the user's question.",
    "When helpful, mention which source paths support your answer.",
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

export function toSources(chunks: IndexedChunk[]): RetrievedSource[] {
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
    });
  }

  return sources;
}
