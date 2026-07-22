import { glob } from "glob";
import path from "path";

const IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.obsidian/**",
  "**/.trash/**",
  "**/.pdf-index/**",
  "**/.docx-index/**",
];

export async function scanDocxFiles(
  vaultPath: string,
  pattern: string,
): Promise<string[]> {
  const files = await glob(pattern, {
    cwd: vaultPath,
    absolute: true,
    nodir: true,
    ignore: IGNORED,
  });

  return files
    .filter((file) => file.toLowerCase().endsWith(".docx"))
    .sort();
}

export function docxSidecarRelativePath(
  docxRelativePath: string,
  indexDir: string,
): string {
  const normalized = docxRelativePath.replace(/\\/g, "/");
  return `${indexDir.replace(/\\/g, "/").replace(/\/$/, "")}/${normalized}.md`;
}

export function sidecarPathForDocx(
  vaultPath: string,
  docxAbsolutePath: string,
  indexDir: string,
): string {
  const relative = path
    .relative(vaultPath, docxAbsolutePath)
    .split(path.sep)
    .join("/");
  return path.join(vaultPath, docxSidecarRelativePath(relative, indexDir));
}
