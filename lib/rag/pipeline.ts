import { embedText } from "@/lib/embeddings/local";
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

export async function retrieveRelevantChunks(options: {
  query: string;
  dataDir: string;
  topK: number;
}): Promise<IndexedChunk[]> {
  const store = await VectorStore.load(options.dataDir);
  if (store.getMeta().chunkCount === 0) {
    return [];
  }

  const queryEmbedding = await embedText(options.query);
  return store.search(queryEmbedding, options.topK);
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
    "Answer ONLY using the provided context from the Obsidian vault.",
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
