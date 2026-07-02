import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { embedText } from "@/lib/embeddings/local";
import { GraphStore } from "@/lib/graph/store";
import { retrieveRelevantChunks } from "@/lib/rag/pipeline";
import { VectorStore } from "@/lib/vector-store/store";

export const runtime = "nodejs";

interface SearchRequestBody {
  query?: string;
  topK?: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export async function POST(request: Request) {
  try {
    const config = getConfig();
    const body = (await request.json()) as SearchRequestBody;
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const topK = body.topK ?? config.topK;
    const chunks = await retrieveRelevantChunks({
      query,
      dataDir: config.dataDir,
      topK,
    });

    const queryEmbedding = await embedText(query);
    const store = await VectorStore.load(config.dataDir);
    const graph = await GraphStore.load(config.dataDir);
    const meta = store.getMeta();

    return NextResponse.json({
      query,
      results: chunks.map((chunk) => ({
        id: chunk.id,
        path: chunk.path,
        title: chunk.title,
        content: chunk.content.slice(0, 400),
        startLine: chunk.startLine,
        score:
          chunk.embedding.length > 0
            ? cosineSimilarity(queryEmbedding, chunk.embedding)
            : 0.5,
        source: "semantic" as const,
      })),
      indexedAt: meta.indexedAt,
      chunkCount: meta.chunkCount,
      graphEdges: graph.getMeta().edgeCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
