import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

import { EMBEDDING_MODEL } from "@/lib/embeddings/local";

export const MANIFEST_VERSION = 2;

export interface ManifestEntry {
  mtimeMs: number;
  size: number;
  chunkCount: number;
  /** Paths stored in Qdrant payload (PDF/DOCX sidecars use source_* paths). */
  qdrantPaths: string[];
}

export interface IndexManifest {
  version: number;
  embeddingModel: string;
  indexedAt: string;
  files: Record<string, ManifestEntry>;
}

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  mtimeMs: number;
  size: number;
}

export interface ManifestDiff {
  added: ScannedFile[];
  modified: ScannedFile[];
  deleted: Array<{ relativePath: string; entry: ManifestEntry }>;
  unchanged: ScannedFile[];
}

export function emptyManifest(): IndexManifest {
  return {
    version: MANIFEST_VERSION,
    embeddingModel: EMBEDDING_MODEL,
    indexedAt: "",
    files: {},
  };
}

export function manifestPath(dataDir: string): string {
  return path.join(dataDir, "index-manifest.json");
}

export async function loadManifest(dataDir: string): Promise<IndexManifest | null> {
  try {
    const raw = await readFile(manifestPath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as IndexManifest;
    if (parsed.version !== MANIFEST_VERSION || !parsed.files) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveManifest(
  dataDir: string,
  manifest: IndexManifest,
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  manifest.indexedAt = new Date().toISOString();
  manifest.embeddingModel = EMBEDDING_MODEL;
  await writeFile(
    manifestPath(dataDir),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

export function shouldFullReindex(options: {
  manifest: IndexManifest | null;
  forceFull: boolean;
}): boolean {
  if (options.forceFull) return true;
  if (!options.manifest) return true;
  if (options.manifest.embeddingModel !== EMBEDDING_MODEL) return true;
  return false;
}

export function diffManifest(
  manifest: IndexManifest,
  scanned: ScannedFile[],
): ManifestDiff {
  const currentByPath = new Map(scanned.map((file) => [file.relativePath, file]));
  const added: ScannedFile[] = [];
  const modified: ScannedFile[] = [];
  const unchanged: ScannedFile[] = [];
  const deleted: ManifestDiff["deleted"] = [];

  for (const file of scanned) {
    const previous = manifest.files[file.relativePath];
    if (!previous) {
      added.push(file);
      continue;
    }
    if (previous.mtimeMs !== file.mtimeMs || previous.size !== file.size) {
      modified.push(file);
      continue;
    }
    unchanged.push(file);
  }

  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    if (!currentByPath.has(relativePath)) {
      deleted.push({ relativePath, entry });
    }
  }

  return { added, modified, deleted, unchanged };
}

export function applyManifestUpdates(
  manifest: IndexManifest,
  updates: Array<{
    relativePath: string;
    mtimeMs: number;
    size: number;
    chunkCount: number;
    qdrantPaths: string[];
  }>,
  deletedRelativePaths: string[],
): void {
  for (const pathToRemove of deletedRelativePaths) {
    delete manifest.files[pathToRemove];
  }
  for (const update of updates) {
    manifest.files[update.relativePath] = {
      mtimeMs: update.mtimeMs,
      size: update.size,
      chunkCount: update.chunkCount,
      qdrantPaths: update.qdrantPaths,
    };
  }
}

export function rebuildManifestFromFiles(
  files: Array<{
    relativePath: string;
    mtimeMs: number;
    size: number;
    chunkCount: number;
    qdrantPaths: string[];
  }>,
): IndexManifest {
  const manifest = emptyManifest();
  for (const file of files) {
    manifest.files[file.relativePath] = {
      mtimeMs: file.mtimeMs,
      size: file.size,
      chunkCount: file.chunkCount,
      qdrantPaths: file.qdrantPaths,
    };
  }
  return manifest;
}
