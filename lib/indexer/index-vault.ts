import { readFile } from "fs/promises";

import { embedTexts } from "@/lib/embeddings/local";
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
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";
import { chunkMarkdown } from "@/lib/indexer/chunk";
import { parseFrontmatter } from "@/lib/indexer/preprocess";
import { scanMarkdownFiles, toRelativePath } from "@/lib/indexer/scan";

export interface IndexResult {
  fileCount: number;
  chunkCount: number;
  graphNodes: number;
  graphEdges: number;
  indexedAt: string;
  warnings?: string[];
}

function edgeKey(from: string, to: string, kind: GraphEdge["kind"]): string {
  return `${from}->${to}:${kind}`;
}

async function indexVaultFiles(options: {
  vaultPath: string;
  pattern: string;
}): Promise<{
  fileCount: number;
  chunks: IndexedChunk[];
  graphNodes: string[];
  graphEdges: GraphEdge[];
  unresolvedNotionLinks: number;
}> {
  const files = await scanMarkdownFiles(options.vaultPath, options.pattern);
  const relativePaths = files.map((file) =>
    toRelativePath(options.vaultPath, file),
  );
  const linkLookup = buildLinkLookup(relativePaths);

  console.log(`[vault] found ${files.length} markdown files`);

  const fileEntries: Array<{ path: string; raw: string }> = [];
  for (const filePath of files) {
    const relativePath = toRelativePath(options.vaultPath, filePath);
    const raw = await readFile(filePath, "utf8");
    fileEntries.push({ path: relativePath, raw });
  }

  const notionLookup = buildNotionIdLookup(fileEntries);
  const edgeSet = new Set<string>();
  const graphEdges: GraphEdge[] = [];
  let unresolvedNotionLinks = 0;
  const chunks: IndexedChunk[] = [];

  for (let i = 0; i < fileEntries.length; i++) {
    const { path: relativePath, raw } = fileEntries[i];

    if (i > 0 && i % 50 === 0) {
      console.log(`[vault] embedding ${i}/${fileEntries.length}...`);
    }

    for (const link of extractWikilinks(raw)) {
      const target = resolveWikilinkTarget(link, linkLookup);
      if (!target || target === relativePath) continue;

      const key = edgeKey(relativePath, target, "wikilink");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      graphEdges.push({ from: relativePath, to: target, kind: "wikilink" });
    }

    for (const pageId of extractNotionPageIds(raw)) {
      const target = resolveNotionPageId(pageId, notionLookup);
      if (!target) {
        unresolvedNotionLinks++;
        continue;
      }
      if (target === relativePath) continue;

      const key = edgeKey(relativePath, target, "notion_link");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      graphEdges.push({ from: relativePath, to: target, kind: "notion_link" });
    }

    const { sourcePdf } = parseFrontmatter(raw);
    const fileChunks = chunkMarkdown(relativePath, raw).map((chunk) => ({
      ...chunk,
      path: sourcePdf ?? chunk.path,
    }));
    if (fileChunks.length === 0) continue;

    const embeddings = await embedTexts(fileChunks.map((chunk) => chunk.content));

    fileChunks.forEach((chunk, index) => {
      chunks.push({
        ...chunk,
        embedding: embeddings[index],
      });
    });
  }

  const wikilinkEdges = graphEdges.filter((edge) => edge.kind === "wikilink").length;
  const notionEdges = graphEdges.filter((edge) => edge.kind === "notion_link").length;
  console.log(
    `[graph] ${relativePaths.length} nodes, ${wikilinkEdges} wikilink + ${notionEdges} notion_link edges`,
  );
  if (unresolvedNotionLinks > 0) {
    console.warn(
      `[graph] ${unresolvedNotionLinks} notion.so links could not be resolved to local md`,
    );
  }

  return {
    fileCount: files.length,
    chunks,
    graphNodes: relativePaths,
    graphEdges,
    unresolvedNotionLinks,
  };
}

export async function indexAll(options: {
  vaultPath: string;
  pattern: string;
  dataDir: string;
}): Promise<IndexResult> {
  const warnings: string[] = [];
  const vaultResult = await indexVaultFiles({
    vaultPath: options.vaultPath,
    pattern: options.pattern,
  });

  if (vaultResult.unresolvedNotionLinks > 0) {
    warnings.push(
      `${vaultResult.unresolvedNotionLinks} notion.so hyperlinks had no matching local md (export cap or missing page).`,
    );
  }

  if (vaultResult.chunks.length === 0) {
    const store = await VectorStore.load(options.dataDir);
    const graph = await GraphStore.load(options.dataDir);
    warnings.push("No markdown chunks produced. Existing index kept.");
    return {
      fileCount: vaultResult.fileCount,
      chunkCount: store.getMeta().chunkCount,
      graphNodes: graph.getMeta().nodeCount,
      graphEdges: graph.getMeta().edgeCount,
      indexedAt: store.getMeta().indexedAt,
      warnings,
    };
  }

  const store = await VectorStore.load(options.dataDir);
  await store.replaceAll(vaultResult.chunks);

  const graph = await GraphStore.load(options.dataDir);
  graph.replaceAll(vaultResult.graphNodes, vaultResult.graphEdges);
  await graph.save();

  return {
    fileCount: vaultResult.fileCount,
    chunkCount: vaultResult.chunks.length,
    graphNodes: vaultResult.graphNodes.length,
    graphEdges: vaultResult.graphEdges.length,
    indexedAt: store.getMeta().indexedAt,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
