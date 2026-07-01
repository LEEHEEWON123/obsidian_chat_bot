import { readFileSync } from "fs";

import {
  createNotionClient,
  normalizeNotionId,
  parseNotionPageIds,
} from "@/lib/notion-export/client";
import { fetchNotionPages } from "@/lib/notion-export/fetch-pages";
import { writePagesToVault } from "@/lib/notion-export/write-to-vault";

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
  const apiKey = process.env.NOTION_API_KEY;
  const rootRaw =
    process.argv[2] ??
    process.env.NOTION_EXPORT_ROOT ??
    process.env.NOTION_PAGE_IDS;
  const vaultPath = process.env.VAULT_PATH;
  const outputDir = process.env.NOTION_EXPORT_DIR ?? "notion";
  const maxPages = Number(process.env.NOTION_MAX_PAGES ?? 500);

  if (!apiKey) {
    throw new Error("NOTION_API_KEY is not set in .env.local");
  }
  if (!rootRaw) {
    throw new Error(
      "Pass Notion page URL as argument or set NOTION_EXPORT_ROOT in .env.local",
    );
  }
  if (!vaultPath) {
    throw new Error("VAULT_PATH is not set in .env.local");
  }

  const rootIds = rootRaw.includes(",")
    ? parseNotionPageIds(rootRaw)
    : [normalizeNotionId(rootRaw)];

  console.log("Exporting Notion pages:", rootIds);
  console.log(`Vault: ${vaultPath}`);
  console.log(`Output: ${vaultPath}/${outputDir}`);
  console.log(`Max pages: ${maxPages}`);

  const notion = createNotionClient(apiKey);
  const { pages, warnings } = await fetchNotionPages(notion, rootIds, {
    maxPages,
  });

  console.log(`Fetched ${pages.length} pages, writing markdown...`);

  const { written, outputPath } = await writePagesToVault({
    vaultPath,
    outputDir,
    pages,
  });

  console.log(`Wrote ${written} markdown files to ${outputPath}`);

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
