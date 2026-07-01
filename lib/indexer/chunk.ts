import { createHash } from "crypto";

export interface DocumentChunk {
  id: string;
  path: string;
  title: string;
  content: string;
  startLine: number;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;

function chunkId(path: string, index: number, content: string): string {
  return createHash("sha256")
    .update(`${path}:${index}:${content.slice(0, 64)}`)
    .digest("hex")
    .slice(0, 16);
}

function splitBySize(text: string): string[] {
  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return parts.filter(Boolean);
}

export function chunkMarkdown(relativePath: string, raw: string): DocumentChunk[] {
  const lines = raw.split("\n");
  const title =
    lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ??
    relativePath.split("/").pop()?.replace(/\.md$/, "") ??
    relativePath;

  const sections: { heading: string; body: string; startLine: number }[] = [];
  let currentHeading = title;
  let currentBody: string[] = [];
  let sectionStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#")) {
      if (currentBody.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join("\n").trim(),
          startLine: sectionStart,
        });
      }
      currentHeading = line.replace(/^#+\s+/, "").trim() || title;
      currentBody = [];
      sectionStart = i + 1;
      continue;
    }
    currentBody.push(line);
  }

  if (currentBody.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentBody.join("\n").trim(),
      startLine: sectionStart,
    });
  }

  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    if (!section.body) continue;

    const pieces =
      section.body.length > CHUNK_SIZE
        ? splitBySize(section.body)
        : [section.body];

    pieces.forEach((piece, index) => {
      const content = `# ${section.heading}\n\n${piece}`.trim();
      chunks.push({
        id: chunkId(relativePath, index, content),
        path: relativePath,
        title: section.heading,
        content,
        startLine: section.startLine,
      });
    });
  }

  return chunks;
}
