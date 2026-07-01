import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { embedText } from "@/lib/embeddings/local";
import { GraphStore } from "@/lib/graph/store";
import { expandResultsWithGraph } from "@/lib/rag/graph-expand";
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
    const scored = chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
        source: "semantic" as const,
      }))
      .sort((a, b) => b.score - a.score);

    const store = await VectorStore.load(config.dataDir);
    const graph = await GraphStore.load(config.dataDir);
    const expanded = expandResultsWithGraph({
      semanticResults: scored,
      graph,
      allChunks: store.getAllChunks(),
      maxGraphAdds: topK,
    });

    const meta = store.getMeta();

    return NextResponse.json({
      query,
      results: expanded.map((item) => ({
        id: item.chunk.id,
        path: item.chunk.path,
        title: item.chunk.title,
        content: item.chunk.content.slice(0, 400),
        startLine: item.chunk.startLine,
        score: item.score,
        source: item.source,
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
