import { readFileSync } from "fs";
import { indexAll } from "../lib/indexer/index-vault";
import { getConfig } from "../lib/config";

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
  const forceFull = process.argv.includes("--full");
  console.log("Indexing vault:", config.vaultPath);
  console.log(`INDEX_INCLUDE=${config.indexInclude}`);
  if (forceFull) {
    console.log("Mode: full reindex");
  } else {
    console.log("Mode: incremental (use --full to rebuild everything)");
  }
  const result = await indexAll({
    vaultPath: config.vaultPath,
    pattern: config.indexInclude,
    dataDir: config.dataDir,
    forceFull,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
