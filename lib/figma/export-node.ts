import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { fetchFigmaImageUrls, fetchFigmaNodes } from "@/lib/figma/client";
import { generateReactTailwind } from "@/lib/figma/codegen-tsx";
import { diffFlatNodes, formatChangeMarkdown } from "@/lib/figma/diff";
import {
  fingerprintNodes,
  flattenNodes,
  summarizeTree,
  type FlatNode,
} from "@/lib/figma/fingerprint";
import { figmaNodeUrl, parseFigmaTarget } from "@/lib/figma/parse-url";
import { figmaSidecarPaths } from "@/lib/figma/paths";
import type {
  FigmaChange,
  FigmaSnapshotMeta,
  ParsedFigmaTarget,
} from "@/lib/figma/types";

export type FigmaExportResult = {
  target: ParsedFigmaTarget;
  change: FigmaChange;
  skipped: boolean;
  paths: {
    meta: string;
    md: string;
    tsx: string;
    diff: string;
    preview?: string;
    relativeMd: string;
  };
  fingerprint: string;
  name: string;
};

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildMarkdown(options: {
  name: string;
  target: ParsedFigmaTarget;
  fingerprint: string;
  summary: { nodeCount: number; textCount: number; componentCount: number };
  change: FigmaChange;
  flat: FlatNode[];
  tsxRelative: string;
  previewRelative?: string;
}): string {
  const url =
    options.target.url ??
    figmaNodeUrl(options.target.fileKey, options.target.nodeId);
  const changeMd = formatChangeMarkdown(options.change);
  const structure = options.flat
    .slice(0, 80)
    .map(
      (n) =>
        `- \`${n.type}\` **${n.name}** (${n.id})` +
        (n.characters ? ` — "${n.characters.slice(0, 80)}"` : ""),
    )
    .join("\n");

  return [
    "---",
    `title: ${JSON.stringify(options.name)}`,
    `source_type: figma`,
    `source_figma: ${JSON.stringify(url)}`,
    `figma_file_key: ${options.target.fileKey}`,
    `figma_node_id: ${JSON.stringify(options.target.nodeId)}`,
    `fingerprint: ${options.fingerprint}`,
    "---",
    "",
    `# ${options.name}`,
    "",
    `- File: \`${options.target.fileKey}\``,
    `- Node: \`${options.target.nodeId}\``,
    `- Link: ${url}`,
    `- Nodes: ${options.summary.nodeCount} (text ${options.summary.textCount}, components ${options.summary.componentCount})`,
    `- TSX: \`${options.tsxRelative}\``,
    ...(options.previewRelative
      ? [`- Preview: \`${options.previewRelative}\``]
      : []),
    "",
    "## Changes since last export",
    "",
    changeMd,
    "",
    "## Structure",
    "",
    structure,
    "",
  ].join("\n");
}

export async function exportFigmaNode(options: {
  vaultPath: string;
  indexDir: string;
  urlOrKey?: string;
  fileKey?: string;
  nodeId?: string;
  exportImages?: boolean;
  maxDepth?: number;
  force?: boolean;
}): Promise<FigmaExportResult> {
  const target = parseFigmaTarget({
    urlOrKey: options.urlOrKey,
    fileKey: options.fileKey,
    nodeId: options.nodeId,
  });
  const maxDepth = options.maxDepth ?? Number(process.env.FIGMA_TREE_MAX_DEPTH ?? 8);
  const exportImages =
    options.exportImages ?? process.env.FIGMA_EXPORT_IMAGES !== "false";

  const paths = figmaSidecarPaths({
    vaultPath: options.vaultPath,
    indexDir: options.indexDir,
    fileKey: target.fileKey,
    nodeId: target.nodeId,
  });

  await mkdir(paths.dir, { recursive: true });

  const api = await fetchFigmaNodes(target.fileKey, [target.nodeId]);
  const entry =
    api.nodes[target.nodeId] ??
    api.nodes[target.nodeId.replace(/:/g, "-")] ??
    api.nodes[Object.keys(api.nodes)[0]];
  if (!entry?.document) {
    throw new Error(
      `Node not found in file ${target.fileKey}: ${target.nodeId}`,
    );
  }

  const root = entry.document;
  const flat = flattenNodes(root, maxDepth);
  const fingerprint = fingerprintNodes(flat);
  const summary = summarizeTree(flat);

  const prevMeta = await readJsonIfExists<FigmaSnapshotMeta>(paths.meta);
  const prevFlat = await readJsonIfExists<FlatNode[]>(paths.flatCache);
  const change = diffFlatNodes(
    prevMeta?.fingerprint === fingerprint ? flat : prevFlat,
    flat,
  );

  // If fingerprint matches previous export, skip rewriting artifacts.
  if (
    !options.force &&
    prevMeta?.fingerprint === fingerprint &&
    change.kind === "unchanged"
  ) {
    return {
      target,
      change: { kind: "unchanged" },
      skipped: true,
      paths: {
        meta: paths.meta,
        md: paths.md,
        tsx: paths.tsx,
        diff: paths.diff,
        preview: prevMeta.previewPath
          ? path.join(options.vaultPath, prevMeta.previewPath)
          : undefined,
        relativeMd: paths.relativeMd,
      },
      fingerprint,
      name: root.name,
    };
  }

  // Recompute change against previous flat when fingerprint differs
  const realChange =
    prevMeta?.fingerprint === fingerprint
      ? ({ kind: "unchanged" } as FigmaChange)
      : diffFlatNodes(prevFlat, flat);

  let previewRelative: string | undefined;
  if (exportImages) {
    try {
      const images = await fetchFigmaImageUrls(target.fileKey, [target.nodeId]);
      const imageUrl = images.images[target.nodeId];
      if (imageUrl) {
        const res = await fetch(imageUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          await writeFile(paths.preview, buf);
          previewRelative = path
            .relative(options.vaultPath, paths.preview)
            .split(path.sep)
            .join("/");
        }
      }
    } catch {
      // Preview is optional
    }
  }

  const url = target.url ?? figmaNodeUrl(target.fileKey, target.nodeId);
  const tsx = generateReactTailwind({
    root,
    fileKey: target.fileKey,
    nodeId: target.nodeId,
    url,
    maxDepth,
  });

  const tsxRelative = path
    .relative(options.vaultPath, paths.tsx)
    .split(path.sep)
    .join("/");

  const md = buildMarkdown({
    name: root.name,
    target: { ...target, url },
    fingerprint,
    summary,
    change: realChange.kind === "unchanged" && !prevMeta ? { kind: "created" } : realChange,
    flat,
    tsxRelative,
    previewRelative,
  });

  const effectiveChange: FigmaChange =
    !prevMeta ? { kind: "created" } : realChange;

  const meta: FigmaSnapshotMeta = {
    fileKey: target.fileKey,
    nodeId: target.nodeId,
    name: root.name,
    figmaVersion: api.version,
    lastModified: api.lastModified,
    exportedAt: new Date().toISOString(),
    fingerprint,
    treeSummary: summary,
    previewPath: previewRelative,
    url,
  };

  await writeFile(paths.meta, JSON.stringify(meta, null, 2), "utf8");
  await writeFile(paths.flatCache, JSON.stringify(flat, null, 2), "utf8");
  await writeFile(paths.md, md, "utf8");
  await writeFile(paths.tsx, tsx, "utf8");
  await writeFile(
    paths.diff,
    `# Diff: ${root.name}\n\n${formatChangeMarkdown(effectiveChange)}\n`,
    "utf8",
  );

  return {
    target,
    change: effectiveChange,
    skipped: false,
    paths: {
      meta: paths.meta,
      md: paths.md,
      tsx: paths.tsx,
      diff: paths.diff,
      preview: previewRelative ? paths.preview : undefined,
      relativeMd: paths.relativeMd,
    },
    fingerprint,
    name: root.name,
  };
}

export async function readFigmaStatus(options: {
  vaultPath: string;
  indexDir: string;
  urlOrKey?: string;
  fileKey?: string;
  nodeId?: string;
}): Promise<{
  meta: FigmaSnapshotMeta | null;
  diffMarkdown: string | null;
  relativeMd: string;
}> {
  const target = parseFigmaTarget({
    urlOrKey: options.urlOrKey,
    fileKey: options.fileKey,
    nodeId: options.nodeId,
  });
  const paths = figmaSidecarPaths({
    vaultPath: options.vaultPath,
    indexDir: options.indexDir,
    fileKey: target.fileKey,
    nodeId: target.nodeId,
  });
  const meta = await readJsonIfExists<FigmaSnapshotMeta>(paths.meta);
  let diffMarkdown: string | null = null;
  try {
    diffMarkdown = await readFile(paths.diff, "utf8");
  } catch {
    diffMarkdown = null;
  }
  return { meta, diffMarkdown, relativeMd: paths.relativeMd };
}
