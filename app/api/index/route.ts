import { NextResponse } from "next/server";

import { assertConfig, getConfig } from "@/lib/config";
import { indexAll } from "@/lib/indexer/index-vault";

export const runtime = "nodejs";

export async function POST() {
  try {
    const config = getConfig();
    assertConfig(config);

    const result = await indexAll({
      vaultPath: config.vaultPath,
      pattern: config.indexInclude,
      dataDir: config.dataDir,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
