export interface PathScope {
  rootFolder?: string;
  pathPrefix?: string;
}

export function normalizePathScopeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function hasPathScope(scope: PathScope): boolean {
  return Boolean(
    normalizePathScopeValue(scope.rootFolder) ||
      normalizePathScopeValue(scope.pathPrefix),
  );
}

/** True when chunk path is inside the optional root folder or path prefix. */
export function matchesPathScope(
  chunkPath: string,
  scope: PathScope,
): boolean {
  const path = chunkPath.replace(/\\/g, "/");

  const prefix = normalizePathScopeValue(scope.pathPrefix);
  if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) {
    return false;
  }

  const root = normalizePathScopeValue(scope.rootFolder);
  if (root) {
    const rootSegment = root.split("/")[0] ?? "";
    const first = path.split("/")[0] ?? "";
    if (first !== rootSegment) return false;
  }

  return true;
}

export function rootFoldersFromScope(scope: PathScope): string[] {
  const root = normalizePathScopeValue(scope.rootFolder);
  if (root) return [root.split("/")[0] ?? root];

  const prefix = normalizePathScopeValue(scope.pathPrefix);
  if (prefix) return [prefix.split("/")[0] ?? prefix];

  return [];
}
