# AX case: CSV query + CLIP image search

Date: 2026-07-22  
Status: approved (SQL/CSV tool + CLIP; captions deferred)

## Goal

Let Hermes answer ad-asset requests from `ax_pre_interview_case_exercise` by:

1. **Structured CSV joins** — performance / brand / date / review filters
2. **CLIP image search** — visual concepts in thumbnails (e.g. usage scene, person)

## Non-goals

- Caption-to-markdown pipeline (optional later)
- Replacing vault text RAG
- Full DuckDB SQL surface (safe structured queries first)

## Architecture

```
AX_CASE_DIR/
  data/*.csv
  thumbnails/*.jpg
        │
        ├─► ax_asset_query (MCP)  — load/join CSVs in process
        │
        └─► ax_clip_index.json ← python CLIP embed
                 │
                 └─► ax_image_search (MCP) — text→CLIP→cosine top-k
```

Hermes combines both tool results and ranks/explains candidates.

## Tools

### `ax_asset_query`

- Loads `assets`, `campaigns`, `review_history`, `performance_sample`
- Operations: `top_performers`, `filter_assets`, `asset_detail`, `list_tables`
- Read-only; no arbitrary code execution

### `ax_image_search`

- Requires prior `npm run ax:clip-index`
- Query text (KO/EN) → multilingual CLIP text tower
- Returns asset ids + paths + scores + optional CSV metadata join

## Config

- `AX_CASE_DIR` — absolute path to case exercise root
- `AX_CLIP_INDEX` — default `data/ax-clip-index.json`
- `AX_CLIP_IMAGE_MODEL` — default `sentence-transformers/clip-ViT-B-32`
- `AX_CLIP_TEXT_MODEL` — default `sentence-transformers/clip-ViT-B-32-multilingual-v1` (same space, KO queries)

## Success check

- “성과 좋았던 소재 3개” → `ax_asset_query` top_performers
- “사용 장면 위주” → `ax_image_search` then enrich via `ax_asset_query`
