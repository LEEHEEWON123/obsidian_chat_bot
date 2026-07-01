import { glob } from "glob";
import path from "path";

const IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.obsidian/**",
  "**/.trash/**",
];

export async function scanMarkdownFiles(
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

export function toRelativePath(vaultPath: string, absolutePath: string): string {
  return path.relative(vaultPath, absolutePath).split(path.sep).join("/");
}
