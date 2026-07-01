import { Client } from "@notionhq/client";

export function createNotionClient(apiKey: string): Client {
  return new Client({ auth: apiKey });
}

/** Notion URL 또는 UUID → API용 page ID */
export function normalizeNotionId(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/([0-9a-f]{32}|[0-9a-f-]{36})$/i)?.[1];
  const id = (fromUrl ?? trimmed).replace(/-/g, "");

  if (!/^[0-9a-f]{32}$/i.test(id)) {
    throw new Error(`Invalid Notion page ID: ${raw}`);
  }

  return id;
}

export function parseNotionPageIds(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeNotionId);
}
