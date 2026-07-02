interface KeywordChunk {
  path: string;
  title: string;
  content: string;
}

export function scoreKeywordMatch(
  chunk: KeywordChunk,
  terms: string[],
): number {
  if (terms.length === 0) return 0;

  const path = chunk.path.toLowerCase();
  const title = chunk.title.toLowerCase();
  const content = chunk.content.toLowerCase();

  let matched = 0;
  let points = 0;

  for (const term of terms) {
    const needle = term.toLowerCase();
    let termMatched = false;

    if (path.includes(needle)) {
      points += 0.34;
      termMatched = true;
    }
    if (title.includes(needle)) {
      points += 0.28;
      termMatched = true;
    }
    if (content.includes(needle)) {
      points += 0.18;
      termMatched = true;
    }

    if (termMatched) matched++;
    else return 0;
  }

  const coverage = matched / terms.length;
  return Math.min(0.99, 0.55 + points + coverage * 0.2);
}

export interface ParsedQuery {
  raw: string;
  semanticQuery: string;
  folderHints: string[];
  terms: string[];
}

const STOPWORDS = new Set([
  "에서",
  "으로",
  "에게",
  "까지",
  "부터",
  "내용",
  "관련",
  "알려",
  "알려줘",
  "해줘",
  "가져",
  "가져와",
  "가져와줘",
  "가져와바",
  "들고",
  "들고와",
  "들고와줘",
  "들고와바",
  "보여",
  "보여줘",
  "정리",
  "정리해줘",
  "요약",
  "요약해줘",
  "찾아",
  "찾아줘",
  "줘",
  "좀",
  "것",
  "거",
  "수",
  "등",
  "및",
  "the",
  "and",
  "for",
  "from",
  "with",
]);

function extractTerms(text: string): string[] {
  const tokens = text
    .replace(/^(에서|으로|에게|까지|부터)\s+/g, "")
    .split(/[\s,./|·]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !STOPWORDS.has(item.toLowerCase()));

  return [...new Set(tokens)];
}

export function parseQuery(query: string): ParsedQuery {
  const terms = extractTerms(query);
  const semanticQuery = terms.join(" ") || query.trim();

  return {
    raw: query,
    semanticQuery,
    // Folder routing is no longer inferred from keywords; the cross-encoder
    // reranker decides relevance from the full query/document context.
    folderHints: [],
    terms,
  };
}

export function matchesRootFolder(path: string, folders: string[]): boolean {
  if (folders.length === 0) return true;
  const root = path.replace(/\\/g, "/").split("/")[0] ?? "";
  return folders.includes(root);
}
