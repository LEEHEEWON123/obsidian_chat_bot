import { readFile } from "fs/promises";

import { embedTexts } from "@/lib/embeddings/local";
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";
import { chunkMarkdown } from "@/lib/indexer/chunk";
import { scanMarkdownFiles, toRelativePath } from "@/lib/indexer/scan";

export interface IndexResult {
  fileCount: number;
  chunkCount: number;
  indexedAt: string;
}

export async function indexVault(options: {
  vaultPath: string;
  pattern: string;
  dataDir: string;
}): Promise<IndexResult> {
  const files = await scanMarkdownFiles(options.vaultPath, options.pattern);
  const allChunks: IndexedChunk[] = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(options.vaultPath, filePath);
    const raw = await readFile(filePath, "utf8");
    const chunks = chunkMarkdown(relativePath, raw);

    if (chunks.length === 0) continue;

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

    chunks.forEach((chunk, index) => {
      allChunks.push({
        ...chunk,
        embedding: embeddings[index],
      });
    });
  }

  const store = await VectorStore.load(options.dataDir);
  store.replaceAll(allChunks);
  await store.save();

  return {
    fileCount: files.length,
    chunkCount: allChunks.length,
    indexedAt: store.getMeta().indexedAt,
  };
}
