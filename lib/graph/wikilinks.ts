/** Extract Obsidian wikilink targets from markdown. */
export function extractWikilinks(content: string): string[] {
  const links = new Set<string>();

  for (const match of content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
    const target = match[1].trim();
    if (target) links.add(target);
  }

  return [...links];
}

export function normalizeLinkKey(value: string): string {
  return value.replace(/\.md$/i, "").toLowerCase();
}

export function basenameWithoutExt(relativePath: string): string {
  const name = relativePath.split("/").pop() ?? relativePath;
  return name.replace(/\.md$/i, "");
}

/** Map wikilink text to vault-relative .md path. */
export function resolveWikilinkTarget(
  linkText: string,
  lookup: Map<string, string>,
): string | null {
  const trimmed = linkText.trim();
  if (!trimmed) return null;

  const candidates = [
    normalizeLinkKey(trimmed),
    normalizeLinkKey(`${trimmed}.md`),
  ];

  for (const key of candidates) {
    const hit = lookup.get(key);
    if (hit) return hit;
  }

  return null;
}

export function buildLinkLookup(relativePaths: string[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const path of relativePaths) {
    lookup.set(normalizeLinkKey(path), path);
    lookup.set(normalizeLinkKey(basenameWithoutExt(path)), path);
  }

  return lookup;
}
