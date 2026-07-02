/** First path segment under VAULT_PATH, e.g. notion/foo.md → notion */
export function rootFolderFromPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const segment = normalized.split("/")[0];
  return segment ?? "";
}
