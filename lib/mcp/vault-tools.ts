import { readFile } from "fs/promises";
import path from "path";

import { getConfig } from "@/lib/config";
import { normalizePathScopeValue } from "@/lib/rag/path-scope";
import { retrieveRelevantChunksWithMeta } from "@/lib/rag/pipeline";

export interface RagSearchHit {
  path: string;
  title: string;
  startLine: number;
  pageNumber?: number;
  score: number;
  source: string;
  content: string;
}

export interface RagSearchResult {
  query: string;
  rootFolder?: string;
  pathPrefix?: string;
  chunkCount: number;
  results: RagSearchHit[];
}

function resolveVaultFile(vaultPath: string, relativePath: string): string {
  const vaultRoot = path.resolve(vaultPath);
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\//, "");
  const absolute = path.resolve(vaultRoot, normalized);

  if (
    absolute !== vaultRoot &&
    !absolute.startsWith(`${vaultRoot}${path.sep}`)
  ) {
    throw new Error(`Path escapes vault: ${relativePath}`);
  }

  return absolute;
}

export async function obsidianRagSearch(options: {
  query: string;
  topK?: number;
  contextPath?: string;
  rootFolder?: string;
  pathPrefix?: string;
  snippetChars?: number;
}): Promise<RagSearchResult> {
  const config = getConfig();
  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not set");
  }

  const query = options.query.trim();
  if (!query) {
    throw new Error("query is required");
  }

  const rootFolder = normalizePathScopeValue(options.rootFolder);
  const pathPrefix = normalizePathScopeValue(options.pathPrefix);
  const topK = options.topK ?? config.topK;
  const snippetChars = options.snippetChars ?? 1200;
  const retrieved = await retrieveRelevantChunksWithMeta({
    query,
    dataDir: config.dataDir,
    topK,
    contextPath: options.contextPath?.trim() || undefined,
    rootFolder,
    pathPrefix,
  });

  return {
    query,
    ...(rootFolder ? { rootFolder } : {}),
    ...(pathPrefix ? { pathPrefix } : {}),
    chunkCount: retrieved.length,
    results: retrieved.map((item) => ({
      path: item.chunk.path,
      title: item.chunk.title,
      startLine: item.chunk.startLine,
      pageNumber: item.chunk.pageNumber,
      score: item.score,
      source: item.source,
      content: item.chunk.content.slice(0, snippetChars),
    })),
  };
}

export async function readVaultNote(relativePath: string): Promise<{
  path: string;
  content: string;
  truncated: boolean;
}> {
  const config = getConfig();
  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not set");
  }

  const trimmed = relativePath.trim();
  if (!trimmed) {
    throw new Error("path is required");
  }

  const absolute = resolveVaultFile(config.vaultPath, trimmed);
  const maxChars = Number(process.env.MCP_READ_NOTE_MAX_CHARS ?? 80_000);
  const raw = await readFile(absolute, "utf8");
  const truncated = raw.length > maxChars;

  return {
    path: trimmed.replace(/\\/g, "/"),
    content: truncated ? raw.slice(0, maxChars) : raw,
    truncated,
  };
}
