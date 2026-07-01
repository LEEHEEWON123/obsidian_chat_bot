import { copyFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    const key = m[1].trim();
    if (process.env[key] === undefined) {
      process.env[key] = m[2].trim();
    }
  }
}

const vaultPath = process.env.VAULT_PATH;
const dataDir = process.env.DATA_DIR ?? "data";
const targetDir = process.env.RAG_INDEX_DIR ?? ".company-rag";

if (!vaultPath) {
  console.error("VAULT_PATH is not set");
  process.exit(1);
}

const source = join(dataDir, "vectors.json");
const graphSource = join(dataDir, "graph.json");
const destDir = join(vaultPath, targetDir);
const dest = join(destDir, "vectors.json");
const graphDest = join(destDir, "graph.json");

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);

let graphEdges = 0;
try {
  copyFileSync(graphSource, graphDest);
  const graphRaw = readFileSync(graphDest, "utf8");
  const graphParsed = JSON.parse(graphRaw) as { meta?: { edgeCount?: number } };
  graphEdges = graphParsed.meta?.edgeCount ?? 0;
} catch {
  // graph optional until build-graph or re-index
}

const raw = readFileSync(dest, "utf8");
const parsed = JSON.parse(raw) as { meta?: { chunkCount?: number; indexedAt?: string } };
console.log(
  JSON.stringify(
    {
      copiedTo: dest,
      graphCopiedTo: graphEdges > 0 ? graphDest : null,
      chunkCount: parsed.meta?.chunkCount ?? 0,
      graphEdges,
      indexedAt: parsed.meta?.indexedAt ?? null,
    },
    null,
    2,
  ),
);
