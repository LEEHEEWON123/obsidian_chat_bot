import { glob } from "glob";
import path from "path";

const IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.obsidian/**",
  "**/.trash/**",
  "**/.venv/**",
  "**/_workspace/**",
  "**/_workspace_prev/**",
  "**/coverage/**",
  "**/test-results/**",
  "**/playwright-report/**",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
  "**/libs/**",
];

export async function scanMarkdownFiles(
  vaultPath: string,
  pattern: string,
): Promise<string[]> {
  const patterns = pattern
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const files: string[] = [];

  for (const item of patterns) {
    const matched = await glob(item, {
      cwd: vaultPath,
      absolute: true,
      nodir: true,
      ignore: IGNORED,
    });

    for (const filePath of matched) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      files.push(filePath);
    }
  }

  return files.sort();
}

export function toRelativePath(vaultPath: string, absolutePath: string): string {
  return path.relative(vaultPath, absolutePath).split(path.sep).join("/");
}
