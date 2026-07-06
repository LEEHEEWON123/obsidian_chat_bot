import { readFile, stat } from "fs/promises";

import { embedTexts } from "@/lib/embeddings/local";
import {
  buildNotionIdLookup,
  extractNotionPageIds,
  resolveNotionPageId,
} from "@/lib/graph/notion-links";
import {
  buildLinkLookup,
  extractWikilinks,
  resolveWikilinkTarget,
} from "@/lib/graph/wikilinks";
import { GraphStore, type GraphEdge } from "@/lib/graph/store";
import { VectorStore, type IndexedChunk } from "@/lib/vector-store/store";
import { chunkMarkdown } from "@/lib/indexer/chunk";
import {
  applyManifestUpdates,
  diffManifest,
  emptyManifest,
  loadManifest,
  rebuildManifestFromFiles,
  saveManifest,
  shouldFullReindex,
  type ScannedFile,
} from "@/lib/indexer/manifest";
import { parseFrontmatter } from "@/lib/indexer/preprocess";
import { scanMarkdownFiles, toRelativePath } from "@/lib/indexer/scan";

export interface IndexResult {
  fileCount: number;
  chunkCount: number;
  graphNodes: number;
  graphEdges: number;
  indexedAt: string;
  mode: "full" | "incremental";
  changedFiles?: number;
  warnings?: string[];
}

export interface IndexOptions {
  vaultPath: string;
  pattern: string;
  dataDir: string;
  forceFull?: boolean;
}

interface FileEntry {
  relativePath: string;
  absolutePath: string;
  raw: string;
  mtimeMs: number;
  size: number;
}

interface FileEmbedResult {
  relativePath: string;
  mtimeMs: number;
  size: number;
  chunks: IndexedChunk[];
  qdrantPaths: string[];
}

function edgeKey(from: string, to: string, kind: GraphEdge["kind"]): string {
  return `${from}->${to}:${kind}`;
}

function qdrantPathsFromChunks(chunks: IndexedChunk[]): string[] {
  return [...new Set(chunks.map((chunk) => chunk.path))];
}

async function scanVaultFiles(
  vaultPath: string,
  pattern: string,
): Promise<ScannedFile[]> {
  const files = await scanMarkdownFiles(vaultPath, pattern);
  const scanned: ScannedFile[] = [];

  for (const absolutePath of files) {
    const fileStat = await stat(absolutePath);
    scanned.push({
      relativePath: toRelativePath(vaultPath, absolutePath),
      absolutePath,
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
    });
  }

  return scanned;
}

async function readFileEntries(scanned: ScannedFile[]): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for (const file of scanned) {
    const raw = await readFile(file.absolutePath, "utf8");
    entries.push({
      relativePath: file.relativePath,
      absolutePath: file.absolutePath,
      raw,
      mtimeMs: file.mtimeMs,
      size: file.size,
    });
  }
  return entries;
}

function buildGraphFromEntries(fileEntries: Array<{ path: string; raw: string }>): {
  graphNodes: string[];
  graphEdges: GraphEdge[];
  unresolvedNotionLinks: number;
} {
  const relativePaths = fileEntries.map((entry) => entry.path);
  const linkLookup = buildLinkLookup(relativePaths);
  const notionLookup = buildNotionIdLookup(fileEntries);
  const edgeSet = new Set<string>();
  const graphEdges: GraphEdge[] = [];
  let unresolvedNotionLinks = 0;

  for (const { path: relativePath, raw } of fileEntries) {
    for (const link of extractWikilinks(raw)) {
      const target = resolveWikilinkTarget(link, linkLookup);
      if (!target || target === relativePath) continue;

      const key = edgeKey(relativePath, target, "wikilink");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      graphEdges.push({ from: relativePath, to: target, kind: "wikilink" });
    }

    for (const pageId of extractNotionPageIds(raw)) {
      const target = resolveNotionPageId(pageId, notionLookup);
      if (!target) {
        unresolvedNotionLinks++;
        continue;
      }
      if (target === relativePath) continue;

      const key = edgeKey(relativePath, target, "notion_link");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      graphEdges.push({ from: relativePath, to: target, kind: "notion_link" });
    }
  }

  return {
    graphNodes: relativePaths,
    graphEdges,
    unresolvedNotionLinks,
  };
}

async function embedFileEntries(
  fileEntries: Array<{ relativePath: string; raw: string; mtimeMs: number; size: number }>,
): Promise<FileEmbedResult[]> {
  const results: FileEmbedResult[] = [];

  for (let i = 0; i < fileEntries.length; i++) {
    const { relativePath, raw, mtimeMs, size } = fileEntries[i];

    if (i > 0 && i % 50 === 0) {
      console.log(`[vault] embedding ${i}/${fileEntries.length}...`);
    }

    const { sourcePdf } = parseFrontmatter(raw);
    const fileChunks = chunkMarkdown(relativePath, raw).map((chunk) => ({
      ...chunk,
      path: sourcePdf ?? chunk.path,
    }));
    if (fileChunks.length === 0) {
      results.push({
        relativePath,
        mtimeMs,
        size,
        chunks: [],
        qdrantPaths: [],
      });
      continue;
    }

    const embeddings = await embedTexts(fileChunks.map((chunk) => chunk.content));
    const chunks = fileChunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    results.push({
      relativePath,
      mtimeMs,
      size,
      chunks,
      qdrantPaths: qdrantPathsFromChunks(chunks),
    });
  }

  return results;
}

function logGraphStats(
  graphNodes: string[],
  graphEdges: GraphEdge[],
  unresolvedNotionLinks: number,
): void {
  const wikilinkEdges = graphEdges.filter((edge) => edge.kind === "wikilink").length;
  const notionEdges = graphEdges.filter((edge) => edge.kind === "notion_link").length;
  console.log(
    `[graph] ${graphNodes.length} nodes, ${wikilinkEdges} wikilink + ${notionEdges} notion_link edges`,
  );
  if (unresolvedNotionLinks > 0) {
    console.warn(
      `[graph] ${unresolvedNotionLinks} notion.so links could not be resolved to local md`,
    );
  }
}

async function saveGraph(
  dataDir: string,
  graphNodes: string[],
  graphEdges: GraphEdge[],
): Promise<GraphStore> {
  const graph = await GraphStore.load(dataDir);
  graph.replaceAll(graphNodes, graphEdges);
  await graph.save();
  return graph;
}

async function indexFull(options: IndexOptions): Promise<IndexResult> {
  const warnings: string[] = [];
  const scanned = await scanVaultFiles(options.vaultPath, options.pattern);
  console.log(`[vault] found ${scanned.length} markdown files`);

  const fileEntries = await readFileEntries(scanned);
  const graphResult = buildGraphFromEntries(
    fileEntries.map((entry) => ({ path: entry.relativePath, raw: entry.raw })),
  );
  logGraphStats(
    graphResult.graphNodes,
    graphResult.graphEdges,
    graphResult.unresolvedNotionLinks,
  );

  if (graphResult.unresolvedNotionLinks > 0) {
    warnings.push(
      `${graphResult.unresolvedNotionLinks} notion.so hyperlinks had no matching local md (export cap or missing page).`,
    );
  }

  const embedResults = await embedFileEntries(fileEntries);
  const chunks = embedResults.flatMap((result) => result.chunks);

  if (chunks.length === 0) {
    const store = await VectorStore.load(options.dataDir);
    const graph = await GraphStore.load(options.dataDir);
    warnings.push("No markdown chunks produced. Existing index kept.");
    return {
      fileCount: scanned.length,
      chunkCount: store.getMeta().chunkCount,
      graphNodes: graph.getMeta().nodeCount,
      graphEdges: graph.getMeta().edgeCount,
      indexedAt: store.getMeta().indexedAt,
      mode: "full",
      warnings,
    };
  }

  const store = await VectorStore.load(options.dataDir);
  await store.replaceAll(chunks);

  const graph = await saveGraph(
    options.dataDir,
    graphResult.graphNodes,
    graphResult.graphEdges,
  );

  const manifest = rebuildManifestFromFiles(
    embedResults.map((result) => ({
      relativePath: result.relativePath,
      mtimeMs: result.mtimeMs,
      size: result.size,
      chunkCount: result.chunks.length,
      qdrantPaths: result.qdrantPaths,
    })),
  );
  await saveManifest(options.dataDir, manifest);

  return {
    fileCount: scanned.length,
    chunkCount: store.getMeta().chunkCount,
    graphNodes: graph.getMeta().nodeCount,
    graphEdges: graph.getMeta().edgeCount,
    indexedAt: store.getMeta().indexedAt,
    mode: "full",
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

async function indexIncremental(options: IndexOptions): Promise<IndexResult> {
  const warnings: string[] = [];
  const scanned = await scanVaultFiles(options.vaultPath, options.pattern);
  const manifest = (await loadManifest(options.dataDir)) ?? emptyManifest();
  const diff = diffManifest(manifest, scanned);

  console.log(
    `[index] incremental: +${diff.added.length} ~${diff.modified.length} -${diff.deleted.length} =${diff.unchanged.length}`,
  );

  if (
    diff.added.length === 0 &&
    diff.modified.length === 0 &&
    diff.deleted.length === 0
  ) {
    console.log("[index] no file changes detected");
    const store = await VectorStore.load(options.dataDir);
    const graph = await GraphStore.load(options.dataDir);
    return {
      fileCount: scanned.length,
      chunkCount: store.getMeta().chunkCount,
      graphNodes: graph.getMeta().nodeCount,
      graphEdges: graph.getMeta().edgeCount,
      indexedAt: store.getMeta().indexedAt,
      mode: "incremental",
      changedFiles: 0,
    };
  }

  const pathsToDelete = new Set<string>();
  for (const item of diff.deleted) {
    for (const qdrantPath of item.entry.qdrantPaths) {
      pathsToDelete.add(qdrantPath);
    }
  }
  for (const file of diff.modified) {
    const previous = manifest.files[file.relativePath];
    if (!previous) continue;
    for (const qdrantPath of previous.qdrantPaths) {
      pathsToDelete.add(qdrantPath);
    }
  }

  const changedScanned = [...diff.added, ...diff.modified];
  const changedEntries = await readFileEntries(changedScanned);
  const embedResults = await embedFileEntries(changedEntries);
  const upsertChunks = embedResults.flatMap((result) => result.chunks);

  const store = await VectorStore.load(options.dataDir);
  await store.patchChunks({
    deletePaths: [...pathsToDelete],
    upsert: upsertChunks,
  });

  const manifestUpdates = embedResults.map((result) => ({
    relativePath: result.relativePath,
    mtimeMs: result.mtimeMs,
    size: result.size,
    chunkCount: result.chunks.length,
    qdrantPaths: result.qdrantPaths,
  }));
  const deletedPaths = diff.deleted.map((item) => item.relativePath);

  applyManifestUpdates(manifest, manifestUpdates, deletedPaths);

  await saveManifest(options.dataDir, manifest);

  const allEntries = await readFileEntries(scanned);
  const graphResult = buildGraphFromEntries(
    allEntries.map((entry) => ({ path: entry.relativePath, raw: entry.raw })),
  );
  logGraphStats(
    graphResult.graphNodes,
    graphResult.graphEdges,
    graphResult.unresolvedNotionLinks,
  );

  if (graphResult.unresolvedNotionLinks > 0) {
    warnings.push(
      `${graphResult.unresolvedNotionLinks} notion.so hyperlinks had no matching local md (export cap or missing page).`,
    );
  }

  const graph = await saveGraph(
    options.dataDir,
    graphResult.graphNodes,
    graphResult.graphEdges,
  );

  const changedFiles =
    diff.added.length + diff.modified.length + diff.deleted.length;

  return {
    fileCount: scanned.length,
    chunkCount: store.getMeta().chunkCount,
    graphNodes: graph.getMeta().nodeCount,
    graphEdges: graph.getMeta().edgeCount,
    indexedAt: store.getMeta().indexedAt,
    mode: "incremental",
    changedFiles,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export async function indexAll(options: IndexOptions): Promise<IndexResult> {
  const manifest = await loadManifest(options.dataDir);
  const full = shouldFullReindex({ manifest, forceFull: options.forceFull ?? false });

  if (full) {
    if (options.forceFull) {
      console.log("[index] full reindex (--full)");
    } else if (!manifest) {
      console.log("[index] full reindex (no manifest)");
    } else {
      console.log("[index] full reindex (embedding model changed)");
    }
    return indexFull(options);
  }

  return indexIncremental(options);
}
