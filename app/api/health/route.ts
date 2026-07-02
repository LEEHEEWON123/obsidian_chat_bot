import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { createQdrantClient } from "@/lib/vector-store/qdrant";
import { VectorStore } from "@/lib/vector-store/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getConfig();
    const store = await VectorStore.load(config.dataDir);
    const meta = store.getMeta();

    let qdrantStatus: "ok" | "error" = "error";
    try {
      const client = createQdrantClient(config.qdrantUrl);
      await client.getCollections();
      qdrantStatus = "ok";
    } catch {
      qdrantStatus = "error";
    }

    return NextResponse.json({
      status: qdrantStatus === "ok" ? "ok" : "degraded",
      vaultPathConfigured: Boolean(config.vaultPath),
      cursorApiKeyConfigured: Boolean(config.cursorApiKey),
      qdrantUrl: config.qdrantUrl,
      qdrantCollection: config.qdrantCollection,
      qdrantStatus,
      indexedAt: meta.indexedAt || null,
      chunkCount: meta.chunkCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
