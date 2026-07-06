import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

import {
  buildNotionIdLookup,
  extractNotionPageIds,
  resolveNotionPageId,
} from "@/lib/graph/notion-links";
import {
  buildLinkLookup,
  extractWikilinks,
  resolveWikilinkTarget,
} from "@/lib/graph/wikilinks";
import { GraphStore, type GraphEdge } from "@/lib/graph/store";
import { scanMarkdownFiles, toRelativePath } from "@/lib/indexer/scan";
import { getConfig } from "@/lib/config";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    const key = m[1].trim();
    if (process.env[key] === undefined) {
      process.env[key] = m[2].trim();
    }
  }
}

function edgeKey(from: string, to: string, kind: GraphEdge["kind"]): string {
  return `${from}->${to}:${kind}`;
}

async function main() {
  const config = getConfig();
  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not set");
  }

  const pattern = process.env.INDEX_INCLUDE ?? "**/*.md";
  const files = await scanMarkdownFiles(config.vaultPath, pattern);
  const relativePaths = files.map((file) =>
    toRelativePath(config.vaultPath, file),
  );
  const linkLookup = buildLinkLookup(relativePaths);

  const fileEntries: Array<{ path: string; raw: string }> = [];
  for (const filePath of files) {
    const from = toRelativePath(config.vaultPath, filePath);
    const raw = await readFile(filePath, "utf8");
    fileEntries.push({ path: from, raw });
  }

  const notionLookup = buildNotionIdLookup(fileEntries);
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  let unresolvedNotionLinks = 0;

  for (const { path: from, raw } of fileEntries) {
    for (const link of extractWikilinks(raw)) {
      const to = resolveWikilinkTarget(link, linkLookup);
      if (!to || to === from) continue;
      const key = edgeKey(from, to, "wikilink");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from, to, kind: "wikilink" });
    }

    for (const pageId of extractNotionPageIds(raw)) {
      const to = resolveNotionPageId(pageId, notionLookup);
      if (!to) {
        unresolvedNotionLinks++;
        continue;
      }
      if (to === from) continue;
      const key = edgeKey(from, to, "notion_link");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from, to, kind: "notion_link" });
    }
  }

  const graph = await GraphStore.load(config.dataDir);
  graph.replaceAll(relativePaths, edges);
  await graph.save();

  const vaultDir = join(config.vaultPath, process.env.RAG_INDEX_DIR ?? ".company-rag");
  const vaultGraph = await GraphStore.load(vaultDir);
  vaultGraph.replaceAll(relativePaths, edges);
  await vaultGraph.save();

  const wikilinkEdges = edges.filter((edge) => edge.kind === "wikilink").length;
  const notionEdges = edges.filter((edge) => edge.kind === "notion_link").length;

  console.log(
    JSON.stringify(
      {
        nodes: relativePaths.length,
        edges: edges.length,
        wikilinkEdges,
        notionLinkEdges: notionEdges,
        unresolvedNotionLinks,
        savedTo: [join(config.dataDir, "graph.json"), join(vaultDir, "graph.json")],
      },
      null,
      2,
    ),
  );
}

void main();
