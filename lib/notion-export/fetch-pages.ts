import type { Client } from "@notionhq/client";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { isNotionClientError } from "@notionhq/client";

import {
  extractLinkedTargets,
} from "@/lib/notion-export/blocks-to-text";
import { extractNotionPageIds } from "@/lib/graph/notion-links";
import {
  extractPageTitle,
  propertiesToText,
} from "@/lib/notion-export/properties-to-text";

export interface NotionPageDocument {
  pageId: string;
  title: string;
  url: string;
  content: string;
}

export interface NotionFetchResult {
  pages: NotionPageDocument[];
  warnings: string[];
}

type QueueItem = {
  id: string;
  kind: "page" | "database";
};

type NotionKind = QueueItem["kind"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatId(id: string): string {
  const raw = id.replace(/-/g, "");
  if (raw.length !== 32) return id;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function normalizePageId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function errorMessage(error: unknown): string {
  if (isNotionClientError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown Notion API error";
}

/** Page-first: avoids databases.retrieve warn when ID is a page. */
async function resolveNotionKind(
  notion: Client,
  id: string,
  kindCache: Map<string, NotionKind>,
  probe: "page-first" | "database-first" = "page-first",
): Promise<NotionKind | "unknown"> {
  const normalized = normalizePageId(id);
  const cached = kindCache.get(normalized);
  if (cached) return cached;

  if (probe === "database-first") {
    try {
      await notion.databases.retrieve({ database_id: formatId(normalized) });
      kindCache.set(normalized, "database");
      return "database";
    } catch (error) {
      if (
        isNotionClientError(error) &&
        error.message.includes("is a page")
      ) {
        kindCache.set(normalized, "page");
        return "page";
      }
    }

    try {
      await notion.pages.retrieve({ page_id: formatId(normalized) });
      kindCache.set(normalized, "page");
      return "page";
    } catch {
      return "unknown";
    }
  }

  try {
    await notion.pages.retrieve({ page_id: formatId(normalized) });
    kindCache.set(normalized, "page");
    return "page";
  } catch (error) {
    if (
      isNotionClientError(error) &&
      error.message.includes("is a database")
    ) {
      kindCache.set(normalized, "database");
      return "database";
    }
  }

  try {
    await notion.databases.retrieve({ database_id: formatId(normalized) });
    kindCache.set(normalized, "database");
    return "database";
  } catch {
    return "unknown";
  }
}

function rememberKind(
  kindCache: Map<string, NotionKind>,
  id: string,
  kind: NotionKind,
): void {
  kindCache.set(normalizePageId(id), kind);
}

function enqueueUnique(
  queue: QueueItem[],
  visited: Set<string>,
  queued: Set<string>,
  kindCache: Map<string, NotionKind>,
  item: QueueItem,
): void {
  const id = normalizePageId(item.id);
  if (visited.has(id)) return;

  if (queued.has(id)) {
    if (item.kind === "database") {
      const existing = queue.find((entry) => entry.id === id);
      if (existing?.kind === "page") {
        existing.kind = "database";
        kindCache.set(id, "database");
      }
    }
    return;
  }

  queued.add(id);
  kindCache.set(id, item.kind);
  queue.push({ id, kind: item.kind });
}

function enqueueChildBlocks(
  queue: QueueItem[],
  visited: Set<string>,
  queued: Set<string>,
  kindCache: Map<string, NotionKind>,
  blocks: BlockObjectResponse[],
): void {
  for (const block of blocks) {
    if (block.type === "child_page") {
      enqueueUnique(queue, visited, queued, kindCache, {
        id: block.id,
        kind: "page",
      });
    }
    if (block.type === "child_database") {
      enqueueUnique(queue, visited, queued, kindCache, {
        id: block.id,
        kind: "database",
      });
    }
  }
}

const BLOCK_RECURSE_MAX_DEPTH = 12;

async function listChildBlocks(
  notion: Client,
  blockId: string,
  cursor?: string,
): Promise<{ blocks: BlockObjectResponse[]; nextCursor?: string }> {
  const blocks: BlockObjectResponse[] = [];

  const response = await notion.blocks.children.list({
    block_id: formatId(blockId),
    start_cursor: cursor,
    page_size: 100,
  });

  for (const block of response.results) {
    if ("type" in block) {
      blocks.push(block as BlockObjectResponse);
    }
  }

  return {
    blocks,
    nextCursor: response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined,
  };
}

/** child_page/child_database are separate queue items — never recurse into them. */
function blockContainsOwnPage(block: BlockObjectResponse): boolean {
  return block.type === "child_page" || block.type === "child_database";
}

/**
 * Walk nested layout blocks (columns, toggles, callouts, etc.) of THE CURRENT
 * page only. Stops at child_page/child_database so scanning one page does not
 * descend into the whole workspace tree.
 */
async function listBlocksRecursive(
  notion: Client,
  blockId: string,
  depth = 0,
): Promise<BlockObjectResponse[]> {
  const collected: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const { blocks, nextCursor } = await listChildBlocks(notion, blockId, cursor);
    cursor = nextCursor;

    for (const block of blocks) {
      collected.push(block);

      if (
        block.has_children &&
        !blockContainsOwnPage(block) &&
        depth < BLOCK_RECURSE_MAX_DEPTH
      ) {
        const nested = await listBlocksRecursive(notion, block.id, depth + 1);
        collected.push(...nested);
      }
    }
  } while (cursor);

  return collected;
}

function enqueueMarkdownPageLinks(
  queue: QueueItem[],
  visited: Set<string>,
  queued: Set<string>,
  kindCache: Map<string, NotionKind>,
  content: string,
): void {
  for (const pageId of extractNotionPageIds(content)) {
    enqueueUnique(queue, visited, queued, kindCache, { id: pageId, kind: "page" });
  }
}

async function listDataSourcePageIds(
  notion: Client,
  dataSourceId: string,
  maxPages: number,
  collected: string[],
): Promise<void> {
  if (collected.length >= maxPages) return;

  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: formatId(dataSourceId),
      start_cursor: cursor,
      page_size: Math.min(100, maxPages - collected.length),
    });

    for (const result of response.results) {
      if ("id" in result && result.object === "page") {
        collected.push(normalizePageId(result.id));
        if (collected.length >= maxPages) return;
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);
}

async function listDatabasePageIds(
  notion: Client,
  databaseId: string,
  maxPages: number,
  warnings: string[],
): Promise<string[]> {
  try {
    const database = await notion.databases.retrieve({
      database_id: formatId(databaseId),
    });

    if (!("data_sources" in database) || !database.data_sources?.length) {
      warnings.push(`Database ${databaseId}: no data sources`);
      return [];
    }

    const pageIds: string[] = [];
    for (const source of database.data_sources) {
      try {
        await listDataSourcePageIds(notion, source.id, maxPages, pageIds);
        if (pageIds.length >= maxPages) break;
      } catch (error) {
        warnings.push(
          `Database source ${source.name || source.id}: ${errorMessage(error)}`,
        );
      }
    }

    return [...new Set(pageIds)];
  } catch (error) {
    warnings.push(`Database ${databaseId}: ${errorMessage(error)}`);
    return [];
  }
}

async function resolveRootItems(
  notion: Client,
  rootIds: string[],
  maxPages: number,
  warnings: string[],
  kindCache: Map<string, NotionKind>,
  rootProbe: "page-first" | "database-first" = "page-first",
): Promise<QueueItem[]> {
  const items: QueueItem[] = [];

  for (const rootId of rootIds) {
    const kind = await resolveNotionKind(
      notion,
      rootId,
      kindCache,
      rootProbe,
    );

    if (kind === "database") {
      const dbPages = await listDatabasePageIds(notion, rootId, maxPages, warnings);
      items.push(...dbPages.map((id) => ({ id, kind: "page" as const })));
      if (dbPages.length === 0) {
        warnings.push(`Database ${rootId}: no rows found (check mcp connection)`);
      }
      continue;
    }

    if (kind === "page") {
      items.push({ id: normalizePageId(rootId), kind: "page" });
      continue;
    }

    warnings.push(`Root ${rootId}: not accessible (check mcp connection)`);
  }

  return items;
}

async function fetchPageDocument(
  notion: Client,
  pageId: string,
): Promise<NotionPageDocument> {
  const page = await notion.pages.retrieve({ page_id: formatId(pageId) });
  const title =
    "properties" in page ? extractPageTitle(page.properties) : "Untitled";
  const url =
    "url" in page && typeof page.url === "string"
      ? page.url
      : `https://notion.so/${pageId}`;

  const markdownResponse = await notion.pages.retrieveMarkdown({
    page_id: formatId(pageId),
  });
  const markdown = markdownResponse.markdown?.trim() ?? "";
  const propertyText =
    "properties" in page ? propertiesToText(page.properties).trim() : "";

  const content =
    [markdown, propertyText].filter(Boolean).join("\n\n") || `# ${title}`;

  return {
    pageId: normalizePageId(pageId),
    title,
    url,
    content,
  };
}

export async function fetchNotionPages(
  notion: Client,
  rootPageIds: string[],
  options?: { maxPages?: number; rootProbe?: "page-first" | "database-first" },
): Promise<NotionFetchResult> {
  const maxPages = options?.maxPages ?? 2000;
  const rootProbe = options?.rootProbe ?? "page-first";
  const warnings: string[] = [];
  const kindCache = new Map<string, NotionKind>();
  const queue = await resolveRootItems(
    notion,
    rootPageIds,
    maxPages,
    warnings,
    kindCache,
    rootProbe,
  );
  const visited = new Set<string>();
  const queued = new Set(queue.map((item) => item.id));
  const pages: NotionPageDocument[] = [];

  if (queue.length === 0) {
    return { pages, warnings };
  }

  console.log(`[notion] queue seeded with ${queue.length} item(s), exporting...`);

  while (queue.length > 0 && pages.length < maxPages) {
    const item = queue.shift();
    if (!item || visited.has(item.id)) continue;

    if (item.kind === "database") {
      visited.add(item.id);
      rememberKind(kindCache, item.id, "database");
      const dbPages = await listDatabasePageIds(
        notion,
        item.id,
        maxPages - pages.length,
        warnings,
      );
      for (const id of dbPages) {
        rememberKind(kindCache, id, "page");
        enqueueUnique(queue, visited, queued, kindCache, { id, kind: "page" });
      }
      await sleep(400);
      continue;
    }

    if (kindCache.get(item.id) === "database") {
      queue.unshift({ id: item.id, kind: "database" });
      continue;
    }

    visited.add(item.id);
    rememberKind(kindCache, item.id, "page");

    try {
      if (pages.length === 0 || pages.length % 5 === 0) {
        console.log(
          `[notion] fetching page ${pages.length + 1} (queue ${queue.length}) id=${item.id.slice(0, 8)}...`,
        );
      }

      const blocks = await listBlocksRecursive(notion, item.id);
      enqueueChildBlocks(queue, visited, queued, kindCache, blocks);

      for (const target of extractLinkedTargets(blocks)) {
        rememberKind(kindCache, target.id, target.kind);
        enqueueUnique(queue, visited, queued, kindCache, target);
      }

      const doc = await fetchPageDocument(notion, item.id);
      enqueueMarkdownPageLinks(queue, visited, queued, kindCache, doc.content);
      pages.push(doc);
      if (pages.length === 1 || pages.length % 10 === 0) {
        console.log(`[notion] fetched ${pages.length} pages (queue ${queue.length})`);
      }
      await sleep(400);
    } catch (error) {
      if (
        isNotionClientError(error) &&
        error.message.includes("is a database")
      ) {
        rememberKind(kindCache, item.id, "database");
        visited.delete(item.id);
        queued.delete(item.id);
        queue.unshift({ id: item.id, kind: "database" });
        continue;
      }
      warnings.push(`Page ${item.id}: ${errorMessage(error)}`);
    }
  }

  if (pages.length >= maxPages) {
    warnings.push(`Stopped at NOTION_MAX_PAGES limit (${maxPages})`);
  }

  return { pages, warnings };
}
