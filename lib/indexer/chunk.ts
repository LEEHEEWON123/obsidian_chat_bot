import { createHash } from "crypto";

import {
  cleanMarkdownForChunk,
  parseFrontmatter,
} from "@/lib/indexer/preprocess";

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

function buildChunkContent(options: {
  documentTitle: string;
  sectionHeading: string;
  piece: string;
}): string {
  const { documentTitle, sectionHeading, piece } = options;
  const parts: string[] = [];

  if (documentTitle && documentTitle !== sectionHeading) {
    parts.push(`# ${documentTitle}`);
  }
  parts.push(`# ${sectionHeading}`, "", piece);

  return parts.join("\n").trim();
}

function chunkTitle(documentTitle: string, sectionHeading: string): string {
  if (!documentTitle || documentTitle === sectionHeading) {
    return sectionHeading;
  }
  return `${documentTitle} — ${sectionHeading}`;
}

export function chunkMarkdown(relativePath: string, raw: string): DocumentChunk[] {
  const { body: rawBody, documentTitle: frontmatterTitle, bodyStartLine } =
    parseFrontmatter(raw);
  const body = cleanMarkdownForChunk(rawBody);
  if (!body) return [];

  const lines = body.split("\n");
  const fallbackTitle =
    lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ??
    relativePath.split("/").pop()?.replace(/\.md$/, "") ??
    relativePath;
  const documentTitle = frontmatterTitle ?? fallbackTitle;

  const sections: { heading: string; body: string; startLine: number }[] = [];
  let currentHeading = documentTitle;
  let currentBody: string[] = [];
  let sectionStart = bodyStartLine;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#")) {
      if (currentBody.length > 0) {
        const sectionBody = cleanMarkdownForChunk(currentBody.join("\n"));
        if (sectionBody) {
          sections.push({
            heading: currentHeading,
            body: sectionBody,
            startLine: sectionStart,
          });
        }
      }
      currentHeading = line.replace(/^#+\s+/, "").trim() || documentTitle;
      currentBody = [];
      sectionStart = i + bodyStartLine;
      continue;
    }
    currentBody.push(line);
  }

  if (currentBody.length > 0) {
    const sectionBody = cleanMarkdownForChunk(currentBody.join("\n"));
    if (sectionBody) {
      sections.push({
        heading: currentHeading,
        body: sectionBody,
        startLine: sectionStart,
      });
    }
  }

  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    const pieces =
      section.body.length > CHUNK_SIZE
        ? splitBySize(section.body)
        : [section.body];

    pieces.forEach((piece, index) => {
      const content = buildChunkContent({
        documentTitle,
        sectionHeading: section.heading,
        piece,
      });
      chunks.push({
        id: chunkId(relativePath, index, content),
        path: relativePath,
        title: chunkTitle(documentTitle, section.heading),
        content,
        startLine: section.startLine,
      });
    });
  }

  return chunks;
}
