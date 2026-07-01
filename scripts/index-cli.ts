import { readFileSync } from "fs";
import { indexAll } from "../lib/indexer/index-vault";
import { getConfig } from "../lib/config";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const config = getConfig();
  console.log("Indexing Notion roots:", config.notionPageIds);
  console.log(`NOTION_MAX_PAGES=${config.notionMaxPages}`);
  const result = await indexAll({
    vaultPath: config.vaultPath || undefined,
    pattern: config.indexInclude,
    notionApiKey: config.notionApiKey || undefined,
    notionPageIds: config.notionPageIds,
    notionMaxPages: config.notionMaxPages,
    dataDir: config.dataDir,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
