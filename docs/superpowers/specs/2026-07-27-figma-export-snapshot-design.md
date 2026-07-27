# Figma on-demand export → React+Tailwind + snapshot diff → Qdrant

Date: 2026-07-27  
Status: approved direction (link/node on-demand, React+Tailwind, snapshot-based incremental index)

## Goal

Given a Figma **file link or node id**, export:

1. Searchable markdown + structured metadata (for vault RAG / Hermes)
2. **React + Tailwind** starter code for frontend publishing
3. A **snapshot** so the next export can report **what changed**
4. **Incremental Qdrant indexing** driven by that snapshot (skip unchanged nodes)

Not a team-wide crawl. Not pixel-perfect codegen. Primary jobs: **퍼블 시작점** + **변경 감지** + **검색 가능 자산 메모**.

## Non-goals

- Full-file / team project sync (unless later requested)
- Perfect responsive production UI from one frame
- Replacing Figma Dev Mode
- Storing raw Figma access tokens in git (env only)

## User flow

```bash
# Link or fileKey + nodeId
npm run figma:export -- "https://www.figma.com/design/FILEKEY/Name?node-id=1-2"
# or
npm run figma:export -- --file FILEKEY --node 1:2

# Writes vault sidecars under .figma-index/...
# Then incremental index picks up changed .md only
npm run index
```

Hermes (optional MCP):

- `figma_export` — run export for a link/node, return paths + change summary
- `figma_diff` — show last change report for a node without re-fetch (or re-fetch+diff)

## Pipeline

```
input: figma URL | fileKey + nodeId
  → parseFileAndNode()
  → GET /v1/files/:fileKey/nodes?ids=:nodeId
  → optional GET /v1/images/:fileKey?ids=... (preview PNG)
  → build snapshot fingerprint (content hash of normalized node tree)
  → compare to previous .meta.json snapshot
  → if unchanged: skip codegen rewrite + skip Qdrant (still print "no changes")
  → if changed / first run:
       write .meta.json (new snapshot)
       write .md (frontmatter + structure summary + change section)
       write .tsx (React + Tailwind approximation)
       write .diff.md (human-readable change list)
       optional save preview under .figma-index/.../preview.png
  → npm run index (existing incremental indexer includes .figma-index/**/*.md)
```

## Snapshot & incremental indexing

### Snapshot (source of truth for “did Figma change?”)

Per node file: `.figma-index/<fileKey>/<safeNodeId>.meta.json`

```json
{
  "fileKey": "...",
  "nodeId": "1:2",
  "name": "Frame name",
  "figmaVersion": "...",
  "exportedAt": "ISO-8601",
  "fingerprint": "sha256:...",
  "treeSummary": { "nodeCount": 12, "textCount": 3, "componentCount": 1 },
  "previewPath": "optional relative path"
}
```

**Fingerprint** hashes a normalized subset of the node JSON:

- id, name, type
- layout (auto-layout mode, padding, gap, sizing)
- absolute size (rounded)
- fills / strokes (normalized)
- characters (text)
- children ids + names + types (recursive, depth-capped)

Ignore volatile fields that change without design intent when possible (e.g. pure export timestamps inside Figma payload if any).

### Change report

Compare previous vs new fingerprint payloads (or structured tree walk):

- added / removed / renamed nodes
- text content changes
- size / layout / fill changes
- component instance swaps

Write `.diff.md` and also embed a short “Changes since last export” section in `.md`.

### Qdrant incremental

Reuse existing vault indexer behavior:

- Sidecar markdown lives under `FIGMA_INDEX_DIR` (default `.figma-index`)
- `INDEX_INCLUDE` auto-appends `.figma-index/**/*.md` (same pattern as pdf/docx)
- Manifest tracks mtime/size of those `.md` files
- **Unchanged Figma node** → export skips rewriting `.md` → indexer sees no mtime change → **no re-embed**
- **Changed node** → new `.md` → incremental upsert for that path only

No separate Qdrant collection required for MVP (same `company-rag`). Optional later: filter via `rootFolder` / `pathPrefix` = `.figma-index` or `figma`.

## Output files (per node)

Under `{VAULT_PATH}/.figma-index/{fileKey}/`:

| File | Role |
|------|------|
| `{nodeId}.meta.json` | Snapshot + fingerprint |
| `{nodeId}.md` | RAG body + frontmatter (`source_figma`, `fileKey`, `nodeId`, `fingerprint`) |
| `{nodeId}.tsx` | React + Tailwind component (not indexed unless also described in md) |
| `{nodeId}.diff.md` | Last change report (optional to index; default **do not** index diffs to avoid noise) |
| `{nodeId}.preview.png` | Optional raster preview |

`nodeId` in filenames uses safe form (`1-2` instead of `1:2`).

## React + Tailwind generation (MVP)

Deterministic first pass (no LLM required for v1):

- Map FRAME/GROUP/COMPONENT → `<div className="...">`
- TEXT → `<p>` / `<span>` with approximate `text-*` / color classes from fills
- Auto-layout → `flex` / `flex-col` / `gap-*` / `p-*` when present
- Absolute-only nodes → `relative` parent + documented caveats in comments
- Comment every root with `// Figma: fileKey nodeId url`

Quality bar: **usable publishing scaffold**, not production-perfect. LLM polish can be a later optional step (`FIGMA_CODEGEN=llm`).

## Config / env

```bash
FIGMA_ACCESS_TOKEN=...          # already in .env.local
FIGMA_INDEX_DIR=.figma-index
FIGMA_INDEX_ENABLED=true        # append to INDEX_INCLUDE
FIGMA_EXPORT_IMAGES=true        # preview PNG
FIGMA_TREE_MAX_DEPTH=8
```

Never commit the token. Rotate if it was pasted into chat logs.

## MCP tools (phase 2, same PR ok if small)

| Tool | Behavior |
|------|----------|
| `figma_export` | parse link → export → return paths + change summary JSON |
| `figma_status` | read `.meta.json` / last `.diff.md` without calling Figma |

Hermes AGENTS note: prefer these over raw terminal curl when user pastes a Figma link.

## Error handling

- Invalid URL / missing node → clear CLI error
- 403/404 from Figma → token scope or access message
- Rate limit → retry with backoff once, then fail
- Missing previous snapshot → treat as first export (`changeType: created`)

## Success criteria

1. Export same node twice with no Figma edits → fingerprint match → **no md rewrite** → `npm run index` reports 0 changed for that path
2. Edit text in Figma → re-export → `.diff.md` lists text change → md updated → incremental index upserts that chunk only
3. `.tsx` renders a recognizable structure in a Next/React+Tailwind app (manual smoke)
4. Hermes can answer “이 프레임에서 뭐가 바뀌었어?” from indexed md / `figma_status`

## Implementation order

1. Parse URL + Figma REST client (`lib/figma/`)
2. Snapshot fingerprint + diff
3. Write md / meta / tsx / optional preview
4. Wire `FIGMA_INDEX_DIR` into `getConfig` + `npm run figma:export`
5. MCP tools + AGENTS blurb
6. README + `.env.example` (no secrets)

## Open decisions (defaults chosen)

- **Codegen:** deterministic Tailwind mapper first; LLM optional later
- **Index diffs:** no (only summary inside main `.md`)
- **Collection:** shared `company-rag`, path under `.figma-index/`
