import { embedTexts } from "@/lib/embeddings/local";
import { chunkMarkdown } from "@/lib/indexer/chunk";
import type { IndexedChunk } from "@/lib/vector-store/store";
import { createNotionClient } from "@/lib/notion/client";
import { fetchNotionPages } from "@/lib/notion/fetch-pages";

export async function indexNotionPages(options: {
  apiKey: string;
  pageIds: string[];
}): Promise<{ pageCount: number; chunks: IndexedChunk[] }> {
  if (options.pageIds.length === 0) {
    return { pageCount: 0, chunks: [] };
  }

  const notion = createNotionClient(options.apiKey);
  const pages = await fetchNotionPages(notion, options.pageIds);
  const chunks: IndexedChunk[] = [];

  for (const page of pages) {
    const pagePath = `notion://${page.pageId}`;
    const pageChunks = chunkMarkdown(pagePath, `${page.content}\n\nSource: ${page.url}`);

    if (pageChunks.length === 0) continue;

    const embeddings = await embedTexts(pageChunks.map((chunk) => chunk.content));

    pageChunks.forEach((chunk, index) => {
      chunks.push({
        ...chunk,
        title: page.title,
        embedding: embeddings[index],
      });
    });
  }

  return {
    pageCount: pages.length,
    chunks,
  };
}
