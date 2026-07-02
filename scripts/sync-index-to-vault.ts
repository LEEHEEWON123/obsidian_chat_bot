import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { getConfig } from "../lib/config";
import { VectorStore } from "../lib/vector-store/store";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    const key = m[1].trim();
    if (process.env[key] === undefined) {
      process.env[key] = m[2].trim();
    }
  }
}

async function main() {
  const config = getConfig();
  const vaultPath = config.vaultPath;
  const targetDir = process.env.RAG_INDEX_DIR ?? ".company-rag";

  if (!vaultPath) {
    console.error("VAULT_PATH is not set");
    process.exit(1);
  }

  const store = await VectorStore.load(config.dataDir);
  const snapshot = await store.exportSnapshot();

  const destDir = join(vaultPath, targetDir);
  const dest = join(destDir, "vectors.json");
  mkdirSync(destDir, { recursive: true });
  writeFileSync(dest, JSON.stringify(snapshot), "utf8");

  const graphSource = join(config.dataDir, "graph.json");
  const graphDest = join(destDir, "graph.json");

  let graphEdges = 0;
  try {
    const graphRaw = readFileSync(graphSource, "utf8");
    writeFileSync(graphDest, graphRaw, "utf8");
    const graphParsed = JSON.parse(graphRaw) as { meta?: { edgeCount?: number } };
    graphEdges = graphParsed.meta?.edgeCount ?? 0;
  } catch {
    // graph optional until build-graph or re-index
  }

  console.log(
    JSON.stringify(
      {
        exportedFrom: "qdrant",
        copiedTo: dest,
        graphCopiedTo: graphEdges > 0 ? graphDest : null,
        chunkCount: snapshot.meta.chunkCount,
        graphEdges,
        indexedAt: snapshot.meta.indexedAt,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
