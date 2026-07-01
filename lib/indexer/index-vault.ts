import { readFile } from "fs/promises";

import { embedTexts } from "@/lib/embeddings/local";
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";
import { chunkMarkdown } from "@/lib/indexer/chunk";
import { scanMarkdownFiles, toRelativePath } from "@/lib/indexer/scan";
import { indexNotionPages } from "@/lib/notion/index-notion";

export interface IndexResult {
  fileCount: number;
  notionPageCount: number;
  chunkCount: number;
  indexedAt: string;
}

async function indexVaultFiles(options: {
  vaultPath: string;
  pattern: string;
}): Promise<{ fileCount: number; chunks: IndexedChunk[] }> {
  const files = await scanMarkdownFiles(options.vaultPath, options.pattern);
  const chunks: IndexedChunk[] = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(options.vaultPath, filePath);
    const raw = await readFile(filePath, "utf8");
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

  return { fileCount: files.length, chunks };
}

export async function indexAll(options: {
  vaultPath?: string;
  pattern: string;
  notionApiKey?: string;
  notionPageIds?: string[];
  dataDir: string;
}): Promise<IndexResult> {
  const allChunks: IndexedChunk[] = [];
  let fileCount = 0;
  let notionPageCount = 0;

  if (options.vaultPath) {
    const vaultResult = await indexVaultFiles({
      vaultPath: options.vaultPath,
      pattern: options.pattern,
    });
    fileCount = vaultResult.fileCount;
    allChunks.push(...vaultResult.chunks);
  }

  if (options.notionApiKey && options.notionPageIds?.length) {
    const notionResult = await indexNotionPages({
      apiKey: options.notionApiKey,
      pageIds: options.notionPageIds,
    });
    notionPageCount = notionResult.pageCount;
    allChunks.push(...notionResult.chunks);
  }

  const store = await VectorStore.load(options.dataDir);
  store.replaceAll(allChunks);
  await store.save();

  return {
    fileCount,
    notionPageCount,
    chunkCount: allChunks.length,
    indexedAt: store.getMeta().indexedAt,
  };
}
