# Figma Export + Snapshot Incremental Index Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** On-demand Figma link/node export to `.figma-index` (md + React/Tailwind tsx + snapshot meta/diff) with snapshot-based skip and existing incremental Qdrant indexing.

**Architecture:** Parse Figma URL → REST nodes (+ optional image) → fingerprint vs previous `.meta.json` → write sidecars only when changed → `INDEX_INCLUDE` includes `.figma-index/**/*.md`.

**Tech Stack:** TypeScript, Figma REST API, existing vault indexer, MCP stdio tools.

---

### Task 1: Parse + REST client
- Create: `lib/figma/parse-url.ts`, `lib/figma/client.ts`, `lib/figma/types.ts`
- [ ] Parse design/file/proto URLs and `node-id`
- [ ] `fetchNodes`, `fetchImages` with `FIGMA_ACCESS_TOKEN`

### Task 2: Snapshot fingerprint + diff
- Create: `lib/figma/fingerprint.ts`, `lib/figma/diff.ts`
- [ ] Normalize tree → sha256 fingerprint
- [ ] Diff previous vs current for change list

### Task 3: Codegen + writers
- Create: `lib/figma/codegen-tsx.ts`, `lib/figma/export-node.ts`, `lib/figma/paths.ts`
- [ ] Write meta/md/tsx/diff/preview under `{VAULT}/.figma-index/{fileKey}/`
- [ ] Skip rewrite when fingerprint matches

### Task 4: Config + CLI
- Modify: `lib/config.ts`, `package.json`, `.env.example`
- Create: `scripts/figma-export-cli.ts`
- [ ] `FIGMA_INDEX_DIR`, append to `INDEX_INCLUDE`
- [ ] `npm run figma:export`

### Task 5: MCP + AGENTS + README
- Modify: `scripts/mcp-server.ts`, `hermes/AGENTS.md`, `README.md`
- [ ] `figma_export`, `figma_status` tools

### Task 6: Smoke
- [ ] Export twice → second is unchanged
- [ ] Unit-test parse-url + fingerprint with fixture JSON
