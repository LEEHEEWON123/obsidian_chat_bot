import { readFile } from "fs/promises";

import { embedTexts } from "@/lib/embeddings/local";
import {
  buildLinkLookup,
  extractWikilinks,
  resolveWikilinkTarget,
} from "@/lib/graph/wikilinks";
import { GraphStore, type GraphEdge } from "@/lib/graph/store";
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";
import { chunkMarkdown } from "@/lib/indexer/chunk";
import { scanMarkdownFiles, toRelativePath } from "@/lib/indexer/scan";

export interface IndexResult {
  fileCount: number;
  chunkCount: number;
  graphNodes: number;
  graphEdges: number;
  indexedAt: string;
  warnings?: string[];
}

async function indexVaultFiles(options: {
  vaultPath: string;
  pattern: string;
}): Promise<{
  fileCount: number;
  chunks: IndexedChunk[];
  graphNodes: string[];
  graphEdges: GraphEdge[];
}> {
  const files = await scanMarkdownFiles(options.vaultPath, options.pattern);
  const chunks: IndexedChunk[] = [];
  const relativePaths = files.map((file) =>
    toRelativePath(options.vaultPath, file),
  );
  const linkLookup = buildLinkLookup(relativePaths);
  const edgeSet = new Set<string>();
  const graphEdges: GraphEdge[] = [];

  console.log(`[vault] found ${files.length} markdown files`);

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    if (i > 0 && i % 50 === 0) {
      console.log(`[vault] embedding ${i}/${files.length}...`);
    }

    const relativePath = toRelativePath(options.vaultPath, filePath);
    const raw = await readFile(filePath, "utf8");

    for (const link of extractWikilinks(raw)) {
      const target = resolveWikilinkTarget(link, linkLookup);
      if (!target || target === relativePath) continue;

      const key = `${relativePath}->${target}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      graphEdges.push({ from: relativePath, to: target, kind: "wikilink" });
    }

    const fileChunks = chunkMarkdown(relativePath, raw);
    if (fileChunks.length === 0) continue;

    const embeddings = await embedTexts(fileChunks.map((chunk) => chunk.content));

    fileChunks.forEach((chunk, index) => {
      chunks.push({
        ...chunk,
        embedding: embeddings[index],
      });
    });
  }

  console.log(`[graph] ${relativePaths.length} nodes, ${graphEdges.length} wikilink edges`);

  return {
    fileCount: files.length,
    chunks,
    graphNodes: relativePaths,
    graphEdges,
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
  store.replaceAll(vaultResult.chunks);
  await store.save();

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
