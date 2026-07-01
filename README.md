# Obsidian Chat Bot

Obsidian vault 기반 RAG 회사 전용 챗봇.

vault의 `.md` 파일을 인덱싱하고, **웹 UI** 또는 **Obsidian 플러그인**에서 시멘틱 검색·채팅을 사용합니다. Notion 문서는 export 후 vault `notion/` 폴더에 쌓아 RAG에 포함할 수 있습니다.

> **현재 단계:** MVP (로그인 없음, 로컬 실행)  
> **목표:** 전 직원 Obsidian/vault RAG → 2차: 배포 + 웍스 SSO

---

## 빠른 시작

```bash
npm install
cp .env.example .env.local
# VAULT_PATH, CURSOR_API_KEY 설정

# Notion export (선택) → Documents/notion/
npm run notion:export

# RAG 인덱싱 (notion 폴더만, 권장)
INDEX_INCLUDE="notion/**/*.md" npm run index
npm run build-graph    # [[위키링크]] 그래프 (빠름)
npm run sync-index     # Obsidian 플러그인용 인덱스 복사

npm run dev            # 웹 채팅 + /api/search
```

| 확인 | 방법 |
|------|------|
| 웹 채팅 | http://localhost:3000 |
| Obsidian 플러그인 | `obsidian-plugin/` 빌드 → vault plugins 연결 (아래) |

### 필수 설정

```bash
VAULT_PATH=/Users/you/Documents
CURSOR_API_KEY=crsr_...
CURSOR_MODEL=composer-2.5
RAG_TOP_K=5
INDEX_INCLUDE=notion/**/*.md   # 또는 **/*.md
```

| 변수 | 필수 | 설명 |
|------|------|------|
| `VAULT_PATH` | ✅ | Obsidian vault 절대 경로 |
| `CURSOR_API_KEY` | ✅ | [Cursor Settings](https://cursor.com/settings) → API Keys |
| `INDEX_INCLUDE` | 선택 | 인덱싱 glob (기본 `**/*.md`) |
| `NOTION_EXPORT_DIR` | 선택 | Notion md 저장 폴더 (기본 `notion`) |

---

## 워크플로우 (권장)

```
Notion ──export──► Documents/notion/*.md
                        │
                        ├─ npm run index      → data/vectors.json
                        ├─ npm run build-graph → data/graph.json ([[링크]])
                        └─ npm run sync-index  → .company-rag/ (Obsidian 플러그인)

Obsidian 앱 ── Company RAG 플러그인 ──► /api/search (시멘틱 + 그래프 확장)
웹 브라우저 ── /api/chat ──► Cursor SDK 답변
```

---

## 인덱싱

### CLI 명령

| 명령 | 설명 |
|------|------|
| `npm run index` | vault md → 청크 → 임베딩 → `vectors.json` + `graph.json` |
| `npm run build-graph` | [[위키링크]]만 재빌드 (임베딩 없음, 빠름) |
| `npm run sync-index` | `data/` → `{VAULT_PATH}/.company-rag/` 복사 |
| `npm run notion:export` | Notion API → `{VAULT_PATH}/notion/` md |

```bash
INDEX_INCLUDE="notion/**/*.md" npm run index
```

완료 예:

```json
{
  "fileCount": 481,
  "chunkCount": 29333,
  "graphNodes": 481,
  "graphEdges": 12,
  "indexedAt": "..."
}
```

> Documents 전체(`**/*.md`)는 md **7,000+** → **수 시간** 걸릴 수 있음.  
> 테스트·운영 모두 `notion/**/*.md` 권장.

### 언제 다시?

md 추가/수정 시 **수동 재실행**. 실시간 동기화 없음 (2차: cron).

---

## RAG + 그래프 검색

### 시멘틱 검색

질문 → 임베딩 → `vectors.json` cosine 유사도 top-k

### 그래프 확장 (1-hop)

시멘틱 결과 노트와 `[[위키링크]]`로 **직접 연결된** 이웃 노트를 context에 추가.

> Notion export md는 보통 `[[링크]]`가 없음 → Obsidian에서 링크 추가 후 `npm run build-graph`

```mermaid
flowchart LR
    Q[질문] --> S[시멘틱 top-k]
    S --> G[그래프 1-hop 이웃]
    G --> R[검색 결과 + 🔗 연결]
```

---

## Obsidian 플러그인 (Company RAG)

Obsidian **앱 안** 시멘틱 + 그래프 Lookup (유사도 % 바).

### 설치

```bash
cd obsidian-plugin && npm install && npm run build

mkdir -p ~/Documents/.obsidian/plugins
ln -sf "$(pwd)/../obsidian-plugin" ~/Documents/.obsidian/plugins/company-rag

cd .. && npm run sync-index
npm run dev   # 시멘틱 검색 API
```

Obsidian → Settings → Community plugins → **Company RAG** ON → 리본 🔍

### 플러그인 UI

- 유사도 **%** + 진행 바
- **🔗 연결** = 그래프 이웃 노트
- **노트 열기** → vault md 이동
- API offline → 로컬 키워드 fallback

---

## Notion → Obsidian

1. Notion integration을 export할 페이지/DB에 **연결**
2. `.env.local`:

```bash
NOTION_API_KEY=ntn_...
NOTION_EXPORT_ROOT=https://app.notion.com/p/{page-id}
NOTION_EXPORT_DIR=notion
NOTION_MAX_PAGES=500
```

3. `npm run notion:export` → `Documents/notion/*.md`

---

## API

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/api/chat` | POST | RAG + Cursor SDK 스트리밍 답변 |
| `/api/search` | POST | `{ query, topK? }` → 시멘틱 + 그래프 결과 (플러그인용) |
| `/api/index` | POST | vault 재인덱싱 |
| `/api/health` | GET | `chunkCount`, `indexedAt` |

---

## 프로젝트 구조

```
obsidian_chat_bot/
├── app/api/              # chat, search, index, health
├── lib/
│   ├── indexer/          # scan, chunk, index-vault
│   ├── graph/            # wikilink 파싱, graph.json
│   ├── notion-export/    # Notion → md export
│   ├── embeddings/
│   ├── vector-store/
│   └── rag/              # pipeline, graph-expand
├── obsidian-plugin/      # Company RAG Obsidian plugin
├── scripts/
│   ├── index-cli.ts
│   ├── build-graph-cli.ts
│   ├── sync-index-to-vault.ts
│   └── notion-export-cli.ts
├── data/                 # vectors.json, graph.json (gitignore)
└── .env.local            # gitignore
```

---

## MVP vs 2차

### MVP (현재)

- Obsidian vault RAG + Notion export
- Obsidian **Company RAG** 플러그인 (Lookup)
- 웹 채팅 UI + `/api/search`
- 시멘틱 + [[wikilink]] 그래프 1-hop 확장
- 로컬 임베딩 · localhost

### 2차

- 배포 + 웍스 SSO
- cron 자동 re-index / export
- 플러그인 내 채팅 + 미니 그래프 시각화
- Slack 연동

---

## 과금

| 항목 | 과금 |
|------|------|
| Cursor SDK | Cursor 구독 크레딧 |
| 로컬 임베딩 | 무료 |
| Notion API (export) | Notion 플랜 범위 |

---

## 보안

| 커밋 금지 | 이유 |
|-----------|------|
| `.env.local` | API 키 |
| `data/` | 회사 문서 임베딩 |
| `Documents/notion/` | export된 회사 문서 |

---

## License

TBD
