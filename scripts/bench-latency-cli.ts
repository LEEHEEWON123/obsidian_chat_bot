import { loadLocalEnv } from "../lib/env/load-local-env";

loadLocalEnv();

import { runAssetQuery } from "@/lib/ax-case/asset-query";
import { searchAxClipImages } from "@/lib/ax-case/clip";
import { getConfig } from "@/lib/config";
import { obsidianRagSearch } from "@/lib/mcp/vault-tools";

function ms(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function time(label: string, fn: () => Promise<unknown>) {
  const t0 = process.hrtime.bigint();
  try {
    const result = await fn();
    const elapsed = ms(t0);
    let extra = "";
    if (result && typeof result === "object") {
      if ("chunkCount" in result) {
        extra = ` chunks=${(result as { chunkCount: number }).chunkCount}`;
      } else if ("count" in result) {
        extra = ` count=${(result as { count: number }).count}`;
      }
    }
    console.log(`${label.padEnd(42)} ${elapsed.toFixed(0).padStart(7)} ms${extra}`);
    return result;
  } catch (error) {
    const elapsed = ms(t0);
    console.log(
      `${label.padEnd(42)} ${elapsed.toFixed(0).padStart(7)} ms  ERROR: ${(error as Error).message}`,
    );
    return null;
  }
}

async function main(): Promise<void> {
  const config = getConfig();
  console.log(
    `QDRANT ${config.qdrantUrl}  collection=${config.qdrantCollection}`,
  );
  console.log(
    `rerank=${config.rerankEnabled} topK=${config.topK} recallK=${config.recallK}`,
  );
  console.log("---");

  await time("RAG cold: easy query", () =>
    obsidianRagSearch({ query: "dubright API", topK: 5 }),
  );
  await time("RAG warm: easy query", () =>
    obsidianRagSearch({ query: "dubright frontend 구조", topK: 5 }),
  );
  await time("RAG warm: 2nd easy", () =>
    obsidianRagSearch({ query: "notion 배포 설정", topK: 5 }),
  );

  const prev = process.env.RERANK_ENABLED;
  process.env.RERANK_ENABLED = "false";
  await time("RAG warm: rerank OFF", () =>
    obsidianRagSearch({ query: "dubright API", topK: 5 }),
  );
  process.env.RERANK_ENABLED = prev;

  await time("AX CSV top_performers", () =>
    runAssetQuery({
      operation: "top_performers",
      metric: "conversions",
      limit: 3,
    }),
  );

  await time("AX CLIP search #1", () =>
    searchAxClipImages({ query: "사용 장면", topK: 5, enrich: false }),
  );
  await time("AX CLIP search #2", () =>
    searchAxClipImages({ query: "주방", topK: 5, enrich: false }),
  );

  console.log("--- done ---");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
