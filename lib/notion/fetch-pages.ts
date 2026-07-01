import type { Client } from "@notionhq/client";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";

import {
  extractChildPageIds,
  extractLinkedPageIds,
} from "@/lib/notion/blocks-to-text";

export interface NotionPageDocument {
  pageId: string;
  title: string;
  url: string;
  content: string;
}

async function listTopLevelBlocks(
  notion: Client,
  blockId: string,
): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      if ("type" in block) {
        blocks.push(block as BlockObjectResponse);
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}

async function getPageTitle(notion: Client, pageId: string): Promise<string> {
  const page = await notion.pages.retrieve({ page_id: pageId });

  if (!("properties" in page)) {
    return "Untitled";
  }

  for (const property of Object.values(page.properties)) {
    if (property.type === "title") {
      return property.title.map((item) => item.plain_text).join("") || "Untitled";
    }
  }

  return "Untitled";
}

async function getPageUrl(notion: Client, pageId: string): Promise<string> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  if ("url" in page && typeof page.url === "string") {
    return page.url;
  }
  return `https://notion.so/${pageId}`;
}

async function getPageMarkdown(notion: Client, pageId: string): Promise<string> {
  const response = await notion.pages.retrieveMarkdown({ page_id: pageId });
  return response.markdown ?? "";
}

async function listDataSourcePageIds(
  notion: Client,
  dataSourceId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const result of response.results) {
      if ("id" in result && result.object === "page") {
        ids.push(result.id.replace(/-/g, ""));
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return ids;
}

export async function fetchNotionPages(
  notion: Client,
  rootPageIds: string[],
): Promise<NotionPageDocument[]> {
  const visited = new Set<string>();
  const queue = [...rootPageIds];
  const documents: NotionPageDocument[] = [];

  while (queue.length > 0) {
    const pageId = queue.shift();
    if (!pageId || visited.has(pageId)) continue;
    visited.add(pageId);

    const blocks = await listTopLevelBlocks(notion, pageId);
    const childPageIds = extractChildPageIds(blocks);
    const linkedPageIds = extractLinkedPageIds(blocks);

    for (const id of childPageIds) {
      const isDatabase = blocks.some(
        (block) => block.id.replace(/-/g, "") === id && block.type === "child_database",
      );

      if (isDatabase) {
        try {
          const dbPages = await listDataSourcePageIds(notion, id);
          queue.push(...dbPages);
        } catch {
          // Skip databases that cannot be queried with this integration.
        }
      } else {
        queue.push(id);
      }
    }

    queue.push(...linkedPageIds);

    const title = await getPageTitle(notion, pageId);
    const url = await getPageUrl(notion, pageId);
    const markdown = await getPageMarkdown(notion, pageId);

    documents.push({
      pageId,
      title,
      url,
      content: markdown.trim() ? markdown : `# ${title}`,
    });
  }

  return documents;
}
