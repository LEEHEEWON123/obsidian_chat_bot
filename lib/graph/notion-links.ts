/** Normalize Notion page id to 32-char hex (no dashes). */
export function normalizeNotionPageId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

const NOTION_PAGE_ID_PATTERNS = [
  /(?:www\.)?notion\.so\/(?:[^/?#\s]*\/)?([a-f0-9]{32})(?:[?#/]|$)/gi,
  /(?:app\.)?notion\.com\/p\/([a-f0-9]{32})(?:[?#/]|$)/gi,
];

/** Extract Notion page ids from markdown / `<page url>` / hyperlinks in raw content. */
export function extractNotionPageIds(content: string): string[] {
  const ids = new Set<string>();

  for (const pattern of NOTION_PAGE_ID_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const pageId = match[1]?.toLowerCase();
      if (pageId) ids.add(pageId);
    }
  }

  return [...ids];
}

function notionIdFromFrontmatter(raw: string): string | undefined {
  if (!raw.startsWith("---")) return undefined;

  const end = raw.indexOf("\n---", 3);
  if (end === -1) return undefined;

  const frontmatter = raw.slice(3, end);
  const match = frontmatter.match(/^notion_id:\s*([a-f0-9-]+)/im);
  if (!match) return undefined;

  return normalizeNotionPageId(match[1]);
}

function notionIdPrefixFromFilename(relativePath: string): string | undefined {
  const match = relativePath.match(/\(([a-f0-9]{8})\)\.md$/i);
  return match?.[1]?.toLowerCase();
}

/** Map Notion page id (full or unique 8-char prefix) → vault-relative md path. */
export function buildNotionIdLookup(
  entries: Array<{ path: string; raw: string }>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  const prefixOwners = new Map<string, Set<string>>();

  for (const { path, raw } of entries) {
    const normalizedPath = path.replace(/\\/g, "/");

    const fullId = notionIdFromFrontmatter(raw);
    if (fullId) {
      lookup.set(fullId, normalizedPath);
      const prefix = fullId.slice(0, 8);
      const owners = prefixOwners.get(prefix) ?? new Set<string>();
      owners.add(normalizedPath);
      prefixOwners.set(prefix, owners);
    }

    const filenamePrefix = notionIdPrefixFromFilename(normalizedPath);
    if (filenamePrefix) {
      const owners = prefixOwners.get(filenamePrefix) ?? new Set<string>();
      owners.add(normalizedPath);
      prefixOwners.set(filenamePrefix, owners);
    }
  }

  for (const [prefix, owners] of prefixOwners) {
    if (owners.size === 1) {
      lookup.set(prefix, [...owners][0]!);
    }
  }

  return lookup;
}

export function resolveNotionPageId(
  pageId: string,
  lookup: Map<string, string>,
): string | null {
  const normalized = normalizeNotionPageId(pageId);
  const fullHit = lookup.get(normalized);
  if (fullHit) return fullHit;

  const prefix = normalized.slice(0, 8);
  const prefixHit = lookup.get(prefix);
  if (prefixHit) return prefixHit;

  return null;
}
