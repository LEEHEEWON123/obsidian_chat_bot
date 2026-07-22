export interface ParsedMarkdown {
  body: string;
  documentTitle?: string;
  sourcePdf?: string;
  sourceDocx?: string;
  sourceType?: string;
  /** 1-based line where `body` starts in the original file */
  bodyStartLine: number;
}

/** Parse optional YAML frontmatter and extract `title`. */
export function parseFrontmatter(raw: string): ParsedMarkdown {
  if (!raw.startsWith("---")) {
    return { body: raw, bodyStartLine: 1 };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { body: raw, bodyStartLine: 1 };
  }

  const frontmatter = raw.slice(3, end);
  let bodyStart = end + 4;
  if (raw[bodyStart] === "\n") bodyStart++;
  const body = raw.slice(bodyStart);
  const documentTitle = extractFrontmatterTitle(frontmatter);
  const sourcePdf = extractFrontmatterValue(frontmatter, "source_pdf");
  const sourceDocx = extractFrontmatterValue(frontmatter, "source_docx");
  const sourceType = extractFrontmatterValue(frontmatter, "source_type");
  const bodyStartLine =
    (raw.slice(0, bodyStart).match(/\n/g)?.length ?? 0) + 1;

  return {
    body,
    documentTitle,
    sourcePdf,
    sourceDocx,
    sourceType,
    bodyStartLine,
  };
}

function extractFrontmatterValue(
  frontmatter: string,
  key: string,
): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return undefined;

  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.trim() || undefined;
}

function extractFrontmatterTitle(frontmatter: string): string | undefined {
  const match = frontmatter.match(/^title:\s*(.+)$/m);
  if (!match) return undefined;

  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.trim() || undefined;
}

/** Strip URLs/HTML noise before chunking and embedding. */
export function cleanMarkdownForChunk(text: string): string {
  return (
    text
      // Notion exports wrap prose in ```lang code fences; drop the fence
      // markers so the text embeds as content, not code.
      .replace(/^\s*```[a-zA-Z0-9+-]*\s*$/gm, "")
      // Notion / HTML blocks
      .replace(/<empty-block\s*\/?>/gi, "")
      .replace(/<[^>]+>/g, "")
      // Markdown images → placeholder
      .replace(/!\[[^\]]*]\([^)]+\)/g, "[image]")
      // Markdown links → keep label only
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      // Bare URLs (incl. long S3 / Notion URLs)
      .replace(/https?:\/\/\S+/g, "")
      // Leftover URL-encoded blobs on their own lines
      .replace(/^[%0-9A-Za-z+/=_-]{80,}$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim()
  );
}
