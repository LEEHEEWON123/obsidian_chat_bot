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

const FOLDER_ALIASES: Array<{
  patterns: RegExp[];
  folder: string;
  addToTerms: boolean;
}> = [
  { patterns: [/노션/gi, /\bnotion\b/gi], folder: "notion", addToTerms: false },
  {
    patterns: [/보고팡/gi, /\bvogopang\b/gi],
    folder: "vogopang_front",
    addToTerms: false,
  },
  {
    patterns: [/푸딩툰/gi, /\bpudding\b/gi],
    folder: "pudding_front",
    addToTerms: false,
  },
  {
    patterns: [/덥라이트/gi, /\bdubright\b/gi],
    folder: "dubright_front",
    addToTerms: false,
  },
  { patterns: [/픽미툰/gi, /\bpickme\b/gi], folder: "notion", addToTerms: true },
  {
    patterns: [/럭키디펜스/gi, /\blucky[- ]?defense\b/gi],
    folder: "lucky-defense",
    addToTerms: true,
  },
];

const STOPWORDS = new Set([
  "에서",
  "으로",
  "에게",
  "까지",
  "부터",
  "내용",
  "관련",
  "알려",
  "해줘",
  "가져",
  "들고",
  "들고와",
  "가져와",
  "보여",
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

function stripFolderPhrases(query: string): string {
  let text = query;
  for (const alias of FOLDER_ALIASES) {
    for (const pattern of alias.patterns) {
      text = text.replace(pattern, " ");
    }
  }
  return text
    .replace(/^(에서|으로|에게|까지|부터)\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTerms(text: string): string[] {
  const tokens = text
    .split(/[\s,./|·]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !STOPWORDS.has(item.toLowerCase()));

  return [...new Set(tokens)];
}

export function parseQuery(query: string): ParsedQuery {
  const folderHints = new Set<string>();
  const keywordAliasTokens: string[] = [];

  for (const alias of FOLDER_ALIASES) {
    for (const pattern of alias.patterns) {
      const matches = query.match(new RegExp(pattern.source, pattern.flags));
      if (matches) {
        folderHints.add(alias.folder);
        if (alias.addToTerms) {
          for (const match of matches) {
            const token = match.trim();
            if (token.length >= 2) keywordAliasTokens.push(token);
          }
        }
      }
      pattern.lastIndex = 0;
    }
  }

  const stripped = stripFolderPhrases(query);
  const terms = [
    ...new Set([...extractTerms(stripped), ...keywordAliasTokens]),
  ];
  const semanticQuery = terms.join(" ") || query.trim();

  return {
    raw: query,
    semanticQuery,
    folderHints: [...folderHints],
    terms,
  };
}

export function matchesRootFolder(path: string, folders: string[]): boolean {
  if (folders.length === 0) return true;
  const root = path.replace(/\\/g, "/").split("/")[0] ?? "";
  return folders.includes(root);
}
