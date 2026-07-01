import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { VectorStore } from "@/lib/vector-store/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getConfig();
    const store = await VectorStore.load(config.dataDir);
    const meta = store.getMeta();

    return NextResponse.json({
      status: "ok",
      vaultPathConfigured: Boolean(config.vaultPath),
      notionApiKeyConfigured: Boolean(config.notionApiKey),
      notionPageIdsConfigured: config.notionPageIds.length > 0,
      cursorApiKeyConfigured: Boolean(config.cursorApiKey),
      indexedAt: meta.indexedAt || null,
      chunkCount: meta.chunkCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
