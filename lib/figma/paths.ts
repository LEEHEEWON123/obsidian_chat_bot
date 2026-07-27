import path from "path";

import { safeNodeId } from "@/lib/figma/parse-url";

export function figmaIndexDir(vaultPath: string, indexDir: string): string {
  return path.join(vaultPath, indexDir.replace(/\\/g, "/").replace(/\/$/, ""));
}

export function figmaNodeDir(
  vaultPath: string,
  indexDir: string,
  fileKey: string,
): string {
  return path.join(figmaIndexDir(vaultPath, indexDir), fileKey);
}

export function figmaSidecarPaths(options: {
  vaultPath: string;
  indexDir: string;
  fileKey: string;
  nodeId: string;
}) {
  const dir = figmaNodeDir(
    options.vaultPath,
    options.indexDir,
    options.fileKey,
  );
  const base = safeNodeId(options.nodeId);
  return {
    dir,
    meta: path.join(dir, `${base}.meta.json`),
    md: path.join(dir, `${base}.md`),
    tsx: path.join(dir, `${base}.tsx`),
    diff: path.join(dir, `${base}.diff.md`),
    preview: path.join(dir, `${base}.preview.png`),
    flatCache: path.join(dir, `${base}.flat.json`),
    relativeMd: path
      .join(options.indexDir, options.fileKey, `${base}.md`)
      .split(path.sep)
      .join("/"),
  };
}
