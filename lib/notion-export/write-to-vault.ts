import { mkdir, writeFile } from "fs/promises";
import path from "path";

import type { NotionPageDocument } from "@/lib/notion-export/fetch-pages";

function sanitizeFilename(title: string): string {
  return title.replace(/[/\\?%*:|"<>#]/g, "-").replace(/\s+/g, " ").trim();
}

function fileNameForPage(page: NotionPageDocument): string {
  const base = sanitizeFilename(page.title) || "untitled";
  const suffix = page.pageId.slice(0, 8);
  return `${base} (${suffix}).md`;
}

export async function writePagesToVault(options: {
  vaultPath: string;
  outputDir: string;
  pages: NotionPageDocument[];
}): Promise<{ written: number; outputPath: string }> {
  const outputPath = path.join(options.vaultPath, options.outputDir);
  await mkdir(outputPath, { recursive: true });

  let written = 0;

  for (const page of options.pages) {
    const fileName = fileNameForPage(page);
    const filePath = path.join(outputPath, fileName);
    const body = [
      "---",
      `notion_id: ${page.pageId}`,
      `notion_url: ${page.url}`,
      `title: ${JSON.stringify(page.title)}`,
      "---",
      "",
      page.content,
    ].join("\n");

    await writeFile(filePath, body, "utf8");
    written++;
  }

  return { written, outputPath };
}
