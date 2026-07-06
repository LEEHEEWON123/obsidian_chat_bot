import { glob } from "glob";
import path from "path";

const IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.obsidian/**",
  "**/.trash/**",
  "**/.pdf-index/**",
];

export async function scanPdfFiles(
  vaultPath: string,
  pattern: string,
): Promise<string[]> {
  const files = await glob(pattern, {
    cwd: vaultPath,
    absolute: true,
    nodir: true,
    ignore: IGNORED,
  });

  return files.sort();
}

export function pdfSidecarRelativePath(
  pdfRelativePath: string,
  indexDir: string,
): string {
  const normalized = pdfRelativePath.replace(/\\/g, "/");
  return `${indexDir.replace(/\\/g, "/").replace(/\/$/, "")}/${normalized}.md`;
}

export function sidecarPathForPdf(
  vaultPath: string,
  pdfAbsolutePath: string,
  indexDir: string,
): string {
  const relative = path
    .relative(vaultPath, pdfAbsolutePath)
    .split(path.sep)
    .join("/");
  return path.join(vaultPath, pdfSidecarRelativePath(relative, indexDir));
}
