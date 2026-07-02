import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { GraphStore } from "@/lib/graph/store";
import { retrieveRelevantChunksWithMeta } from "@/lib/rag/pipeline";
import { VectorStore } from "@/lib/vector-store/store";

export const runtime = "nodejs";

interface SearchRequestBody {
  query?: string;
  topK?: number;
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
    const results = await retrieveRelevantChunksWithMeta({
      query,
      dataDir: config.dataDir,
      topK,
    });

    const store = await VectorStore.load(config.dataDir);
    const graph = await GraphStore.load(config.dataDir);
    const meta = store.getMeta();

    return NextResponse.json({
      query,
      recallK: config.recallK,
      rerankEnabled: config.rerankEnabled,
      results: results.map((item) => ({
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
