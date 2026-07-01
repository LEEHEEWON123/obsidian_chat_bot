import { Client } from "@notionhq/client";

export function createNotionClient(apiKey: string): Client {
  return new Client({
    auth: apiKey,
    timeoutMs: 120_000,
  });
}

/** Notion URL 또는 UUID → API용 ID (page/database 공통 32hex) */
export function normalizeNotionId(raw: string): string {
  const trimmed = raw.trim();
  const withoutQuery = trimmed.split("?")[0].split("#")[0];

  // app.notion.com/p/{id} or www.notion.com/p/{id} — ?v= 뷰 ID 제외
  const notionPathMatch = withoutQuery.match(/\/p\/([0-9a-f]{32})/i);
  if (notionPathMatch) {
    return notionPathMatch[1].toLowerCase();
  }

  // notion.so/Title-{id}
  const notionPageMatch = withoutQuery.match(/([0-9a-f]{32})(?:\/)?$/i);
  if (notionPageMatch) {
    return notionPageMatch[1].toLowerCase();
  }

  const id = withoutQuery.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(id)) {
    return id.toLowerCase();
  }

  throw new Error(`Invalid Notion page ID: ${raw}`);
}

export function parseNotionPageIds(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeNotionId);
}
