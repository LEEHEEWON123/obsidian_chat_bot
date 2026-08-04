import { createHash } from "crypto";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

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
  /** PDF page (from opendataloader page separators). */
  pageNumber?: number;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;

/** LangChain RecursiveCharacterTextSplitter — markdown-aware separator priority. */
const RECURSIVE_SEPARATORS = [
  "\n# ",
  "\n## ",
  "\n### ",
  "\n#### ",
  "\n##### ",
  "\n###### ",
  "\n\n",
  "\n",
  ". ",
  " ",
  "",
];

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: RECURSIVE_SEPARATORS,
  keepSeparator: true,
});

function chunkId(path: string, index: number, content: string): string {
  return createHash("sha256")
    .update(`${path}:${index}:${content.slice(0, 64)}`)
    .digest("hex")
    .slice(0, 16);
}

function pageNumberFromText(text: string): number | undefined {
  const match = text.match(/(?:^|\n)#+\s*Page\s+(\d+)\b/i);
  if (!match) return undefined;
  const page = Number(match[1]);
  return Number.isFinite(page) && page > 0 ? page : undefined;
}

function headingFromText(text: string, fallback: string): string {
  const match = text.match(/^#+\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading || fallback;
}

function lineNumberAtOffset(text: string, offset: number, baseLine: number): number {
  if (offset <= 0) return baseLine;
  const slice = text.slice(0, Math.min(offset, text.length));
  return baseLine + slice.split("\n").length - 1;
}

function buildChunkContent(documentTitle: string, piece: string): string {
  const sectionHeading = headingFromText(piece, documentTitle);
  const parts: string[] = [];

  if (documentTitle && documentTitle !== sectionHeading) {
    parts.push(`# ${documentTitle}`);
  }
  if (!piece.trimStart().startsWith("#")) {
    parts.push(`# ${sectionHeading}`, "", piece);
  } else {
    parts.push(piece);
  }

  return parts.join("\n").trim();
}

function chunkTitle(documentTitle: string, piece: string): string {
  const sectionHeading = headingFromText(piece, documentTitle);
  if (!documentTitle || documentTitle === sectionHeading) {
    return sectionHeading;
  }
  return `${documentTitle} — ${sectionHeading}`;
}

export async function chunkMarkdown(
  relativePath: string,
  raw: string,
): Promise<DocumentChunk[]> {
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

  const pieces = await splitter.splitText(body);
  const chunks: DocumentChunk[] = [];
  let searchFrom = 0;

  pieces.forEach((piece, index) => {
    const trimmed = piece.trim();
    if (!trimmed) return;

    const offset = body.indexOf(piece, searchFrom);
    const startOffset = offset >= 0 ? offset : searchFrom;
    if (offset >= 0) {
      searchFrom = offset + Math.max(piece.length - CHUNK_OVERLAP, 1);
    }

    const content = buildChunkContent(documentTitle, trimmed);
    chunks.push({
      id: chunkId(relativePath, index, content),
      path: relativePath,
      title: chunkTitle(documentTitle, trimmed),
      content,
      startLine: lineNumberAtOffset(body, startOffset, bodyStartLine),
      pageNumber: pageNumberFromText(trimmed),
    });
  });

  return chunks;
}
