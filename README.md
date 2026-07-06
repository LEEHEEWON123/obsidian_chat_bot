# Obsidian Chat Bot

Obsidian **vault 폴더** (`VAULT_PATH`) 안의 `.md`를 인덱싱해 **hybrid 검색 + rerank + 채팅**합니다.

벡터 저장은 **Qdrant** (로컬 Docker). Obsidian **Company RAG** 플러그인은 `/api/search`로 검색하고, API가 꺼지면 vault `.company-rag/` offline fallback을 씁니다.

**v0.3** — **`Xenova/bge-m3`** 임베딩(1024차, multilingual) + Hybrid 검색(키워드 + 시맨틱) + **BGE rerank** 2단 retrieval. Qdrant payload에 `rootFolder` 포함.

**v0.2** — `vectors.json` 대신 Qdrant Search Engine 패턴 (HNSW cosine top-K).

---

## 구조

```mermaid
flowchart TB
  subgraph vault["Obsidian Vault (VAULT_PATH)"]
    MD["INDEX_INCLUDE *.md"]
    RAG[".company-rag/<br/>vectors.json · graph.json"]
    PLG[".obsidian/plugins/company-rag"]
  end

  subgraph cli["CLI (npm scripts)"]
    IDX["npm run index"]
    BG["npm run build-graph"]
    SYNC["npm run sync-index"]
  end

  subgraph qdrant["Qdrant (Docker :6333)"]
    VEC["company-rag collection"]
  end

  subgraph server["Next.js (npm run dev :3000)"]
    SEARCH["/api/search"]
    CHAT["/api/chat"]
    META["data/<br/>vector-meta.json · graph.json"]
  end

  subgraph clients["클라이언트"]
    OBS["Obsidian · Company RAG 플러그인"]
    WEB["웹 UI · localhost:3000"]
  end

  MD --> IDX
  IDX --> VEC
  IDX --> META
  BG --> META
  SYNC --> VEC
  SYNC --> RAG
  META --> BG

  PLG -->|"POST /api/search<br/>hybrid + rerank"| SEARCH
  PLG -->|"offline"| RAG
  SEARCH --> VEC
  WEB -->|"POST /api/chat<br/>RAG + Cursor SDK"| CHAT
  CHAT --> VEC
```

### 검색 워크플로우 (v0.3)

```mermaid
flowchart LR
  Q[질문] --> P[parseQuery<br/>키워드·폴더 힌트]
  P --> H[1차 Hybrid Recall]
  H --> K[키워드 scan<br/>path·title·content]
  H --> S[시맨틱 search<br/>bge-m3 · Qdrant top-K]
  K --> M[후보 merge<br/>RAG_RECALL_K]
  S --> M
  M --> R[2차 Rerank<br/>bge-reranker-v2-m3]
  R --> L[최종 top-K<br/>RAG_TOP_K]
  L --> G[LLM /api/chat]
```

| 단계 | 역할 |
|------|------|
| **1차 Hybrid** | 의미(시맨틱) + 정확한 단어(키워드)로 후보 **넓게** 수집 |
| **2차 Rerank** | cross-encoder가 query+청크 쌍을 읽고 **순위 재정렬** |
| **Generation** | rerank된 청크를 context로 Cursor SDK 답변 |

| 구성 | 역할 |
|------|------|
| vault md (`INDEX_INCLUDE`) | 인덱싱 대상 (예: `**/*.md`, `notion/**/*.md`) |
| `npm run index` | md → 임베딩 → **Qdrant** + graph |
| `npm run pdf:export` | PDF → `.pdf-index/**/*.md` sidecar (Java 11+, [OpenDataLoader](https://github.com/opendataloader-project/opendataloader-pdf)) |
| `npm run sync-index` | Qdrant → vault `.company-rag/vectors.json` (offline용) |
| **Company RAG 플러그인** | Obsidian 사이드바 Lookup · `/api/search` 호출 |
| API offline | 플러그인이 `.company-rag/` 로컬 키워드 + 그래프 fallback |
| 웹 UI | 브라우저 채팅 · `/api/chat` |

---

## Vault 구조

```
{VAULT_PATH}/
├── notion/              # 회사 문서 md (INDEX_INCLUDE 대상)
├── *.pdf                # PDF 원본 (PDF_INCLUDE)
├── .pdf-index/          # pdf:export → 검색용 sidecar md
├── .company-rag/        # npm run sync-index → vectors.json, graph.json
└── .obsidian/plugins/company-rag/   # Obsidian 플러그인
```

---

## 설정

```bash
cp .env.example .env.local
```

| 변수 | 설명 |
|------|------|
| `VAULT_PATH` | Obsidian vault 절대 경로 |
| `INDEX_INCLUDE` | 인덱싱 glob (예: `notion/**/*.md`) |
| `CURSOR_API_KEY` | 웹 채팅용 ([Cursor Settings](https://cursor.com/settings)) |
| `RAG_INDEX_DIR` | vault 내 인덱스 폴더 (기본 `.company-rag`) |
| `QDRANT_URL` | Qdrant REST URL (기본 `http://127.0.0.1:6333`) |
| `QDRANT_COLLECTION` | Qdrant 컬렉션 (기본 `company-rag`) |
| `RAG_TOP_K` | rerank **후** LLM·API에 넘길 최종 청크 수 |
| `RAG_RECALL_K` | hybrid **1차** 후보 풀 크기 (기본 `50`) |
| `EMBEDDING_MODEL` | bi-encoder (기본 `Xenova/bge-m3`, **1024차원**). 변경 시 `npm run index` 재실행 |
| `EMBED_BATCH_SIZE` | 임베딩 배치 크기 (기본 `8`, 선택) |
| `RERANK_ENABLED` | cross-encoder rerank 사용 (`true` / `false`) |
| `RERANK_MODEL` | rerank ONNX 모델 (기본 `woxpas-ai/bge-reranker-v2-m3-onnx`) |
| `RERANK_BATCH_SIZE` | rerank 배치 크기 (기본 `8`) |
| `RERANK_MIN_SCORE` | rerank **관련성 하한** (raw logit, 기본 `0`). 미만 청크는 검색 결과에서 제외 |
| `PDF_INCLUDE` | export 대상 PDF glob (기본 `**/*.pdf`) |
| `PDF_INDEX_DIR` | sidecar md 저장 폴더 (기본 `.pdf-index`). `npm run index`에 자동 포함 |
| `PDF_HYBRID` | 스캔 PDF OCR 시 `docling-fast` (hybrid 서버 필요) |

---

## PDF 검색 + Obsidian READ

텍스트 PDF는 **OpenDataLoader**로 md sidecar를 만들고, 기존 **bge-m3 + rerank** 파이프로 검색합니다.  
검색 결과 `path`는 **원본 PDF**를 가리키며, `pageNumber`가 있으면 Obsidian PDF++에서 `#page=N`으로 열 수 있습니다.

```bash
# Java 11+ 필요: java -version
npm run pdf:export    # vault PDF → .pdf-index/**/*.md
npm run index         # sidecar + notion md 함께 인덱싱
```

| 단계 | 도구 |
|------|------|
| PDF → 텍스트 | `@opendataloader/pdf` (local) |
| 스캔 PDF OCR | hybrid + `--ocr-lang ko,en` → `PDF_HYBRID=docling-fast` |
| 검색 | bge-m3 · Qdrant · bge-reranker (Notion과 동일) |
| 화면 READ | Obsidian PDF++ (`[[file.pdf#page=5]]`) |

Sidecar frontmatter 예:

```yaml
---
title: "보고서"
source_pdf: documents/report.pdf
source_type: pdf
---
```

---

## 사용

```bash
npm install

npm run qdrant:up    # Qdrant Docker (최초 1회)
npm run index
npm run build-graph   # [[위키링크]]만 갱신 (임베딩 없음)
npm run sync-index    # .company-rag/ 로 offline 스냅샷 export

npm run dev           # http://localhost:3000
```

md 추가·수정 후 `npm run index` → `npm run sync-index` 를 다시 실행합니다.

### Qdrant (로컬 Docker)

```bash
npm run qdrant:up     # http://127.0.0.1:6333
npm run qdrant:down
```

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant REST API |
| `QDRANT_COLLECTION` | `company-rag` | 컬렉션 이름 |

벡터·청크 본문은 Qdrant에 저장됩니다. `data/vector-meta.json`에는 `indexedAt`, `chunkCount`만 둡니다.

**대시보드:** [http://localhost:6333/dashboard](http://localhost:6333/dashboard) · 컬렉션 `company-rag`

**초기 풀 인덱스**는 로컬 embed(`Xenova/bge-m3`)가 병목입니다. vault 전체(`**/*.md`, 수천 파일)면 **수 시간** 걸릴 수 있습니다. Qdrant upsert는 임베딩이 끝난 뒤 배치로 진행됩니다.

> **`EMBEDDING_MODEL` 또는 차원을 바꾼 뒤에는 반드시 `npm run index`로 재인덱싱**해야 합니다. Qdrant 컬렉션이 새 차원으로 다시 만들어집니다.

> v0.3 예정: 변경 파일만 재인덱싱 (증분). v0.2는 매번 풀 스캔.

---

## 인덱싱 기준

### 어떤 파일이 대상인가

`{VAULT_PATH}` 아래에서 **`INDEX_INCLUDE` glob**에 맞는 `.md`만 인덱싱합니다.

```bash
# 권장 — 회사 문서만
INDEX_INCLUDE=notion/**/*.md

# vault 전체 (md 수천 개 → 수 시간 걸릴 수 있음)
INDEX_INCLUDE=**/*.md
```

**자동 제외** (`lib/indexer/scan.ts`):

- `node_modules/`, `.git/`, `.obsidian/`, `.trash/`

### 어떻게 잘라서 저장하나 (청킹)

검색 단위는 **파일 1개가 아니라 청크 1개**입니다. `npm run index` 시 아래 순서로 처리되고, Qdrant `company-rag` 컬렉션에 저장됩니다.

```
원본 .md
  → ① frontmatter 분리 + title 추출
  → ② 전처리 (cleanMarkdownForChunk)
  → ③ # 헤딩 기준 섹션 분리
  → ④ 섹션 본문이 800자 초과 시 overlap 120으로 분할
  → ⑤ content/title 조립
  → ⑥ content 임베딩 (1024차원)
  → Qdrant (vector + payload)
```

구현: `lib/indexer/preprocess.ts` (전처리) · `lib/indexer/chunk.ts` (청킹)

#### 규칙 요약

| 규칙 | 값 |
|------|-----|
| 문서 제목 | frontmatter `title:` → 없으면 첫 `#` → 없으면 파일명 |
| 섹션 분리 | `#`로 시작하는 줄 = 새 섹션 (`##`, `###` 포함) |
| `#` 없는 본문 | 문서 제목을 섹션 제목으로 사용 |
| 최대 청크 크기 | **800자** (섹션 **본문** 기준) |
| 겹침 (overlap) | **120자** (800자 초과 섹션을 여러 청크로 자를 때만) |
| 분할 방식 | 문단/문장이 아니라 **글자 수** 기준 기계적 슬라이스 |
| 임베딩 대상 | payload **`content`** 전체 (`Xenova/bge-m3`, 1024차원) |
| 청크 `content` | `# 문서제목`(섹션과 다를 때) + `# 섹션제목` + 본문 조각 |
| payload `title` | `문서제목 — 섹션제목` (같으면 섹션만) |
| 전처리 후 본문 없음 | 해당 파일 **청크 0개** (인덱스에서 스킵) |

#### 전처리 (`cleanMarkdownForChunk`)

인덱싱 시 **1회** 적용. 검색 시에는 다시 돌리지 않습니다.

| 처리 | 내용 |
|------|------|
| Notion 코드펜스 | ` ```javascript ` 등 **펜스 라인만** 제거 (안의 본문은 유지) |
| HTML | `<empty-block/>`, `<table>` 등 태그 제거 |
| 이미지 | `![](url)` → `[image]` |
| 링크 | `[텍스트](url)` → 텍스트만 |
| URL | 긴 `https://...` 제거 |

> Notion export는 회의 본문을 ` ```javascript ` 블록으로 감싸는 경우가 많습니다. 펜스를 그대로 두면 임베딩이 코드로 오염되고, `# 구분` / `# 이름` 같은 짧은 메타 섹션이 본문보다 검색 상위에 뜰 수 있습니다.

#### 섹션·청크 예시 (정기미팅)

`notion/11월 10일 정기미팅 (2a61bb2b).md` 같은 노션 문서:

| 섹션 | 내용 | 결과 |
|------|------|------|
| (제목 섹션) | `[플랫폼본부]`, 푸딩툰 65%, 픽미툰… | **본문 청크** (길면 800자 단위로 여러 개) |
| `# 구분` | `정기` | 짧은 메타 청크 |
| `# 이름` | `11월 10일 정기미팅` | 짧은 메타 청크 |

임베딩되는 `content` 예:

```markdown
# 11월 10일 정기미팅

[플랫폼본부]

--- 지난주 업무 진행 상황 ---

[푸딩툰 리뉴얼]
- 작업 목표 진행율 : 65%(목표:70%)
...
```

#### Qdrant 포인트 1개 = 청크 1개

| 필드 | 설명 |
|------|------|
| **vector** | `content` 임베딩 (1024차원, cosine) |
| `path` | vault 기준 상대경로 (예: `notion/foo.md`) |
| `title` | UI·키워드 검색용 |
| `content` | 임베딩·리랭크·채팅 스니펫에 사용하는 전체 텍스트 |
| `startLine` | 원본 md에서 해당 섹션 시작 줄 (대략) |
| `rootFolder` | 경로 첫 segment (예: `notion`) |
| `id` | `sha256(path:index:content앞64자)` 16자 |

**원본 md 파일 전체는 Qdrant에 저장되지 않습니다.** 검색으로 `path` + `startLine`만 알 수 있고, 전문이 필요하면 vault에서 해당 md를 직접 열어야 합니다.

청킹·전처리 규칙을 바꾼 뒤에는 **`npm run index`를 다시 실행**해야 Qdrant에 반영됩니다.

파일 1개가 여러 청크가 될 수 있습니다. 검색·유사도는 **파일 단위가 아니라 청크 단위**입니다.

### 무엇이 저장되나

| 출력 | 내용 |
|------|------|
| **Qdrant** `company-rag` | 청크 텍스트 + 임베딩 벡터 + payload (`path`, `title`, `content`, `startLine`, `rootFolder`) |
| `data/vector-meta.json` | 인덱스 메타 (`indexedAt`, `chunkCount`) |
| `graph.json` | 같은 md들의 `[[wikilink]]` 노드·엣지 |

`npm run index`는 **vectors + graph** 둘 다 갱신합니다. `npm run build-graph`는 wikilink 그래프만 다시 빌드합니다.

---

## Obsidian 플러그인 (Company RAG)

```bash
cd obsidian-plugin && npm install && npm run build

mkdir -p {VAULT_PATH}/.obsidian/plugins
ln -sf /path/to/obsidian_chat_bot/obsidian-plugin {VAULT_PATH}/.obsidian/plugins/company-rag

npm run sync-index
npm run dev    # 시멘틱 검색 API
```

Obsidian → Community plugins → **Company RAG** ON → 리본 🔍

- 유사도 **%** + **🔗 연결** (wikilink 이웃)
- **노트 열기** → vault md 이동

---

## 기술 스택

### 앱

| 기술 | 용도 |
|------|------|
| [Next.js 16](https://nextjs.org/) | 웹 UI + API Route (`/api/chat`, `/api/search`) |
| [React 19](https://react.dev/) | 채팅 UI |
| [TypeScript](https://www.typescriptlang.org/) | 앱·플러그인·CLI |
| [Tailwind CSS 4](https://tailwindcss.com/) | 웹 스타일 |
| [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) | `/api/chat` 스트리밍 답변 |

### RAG (Retrieval-Augmented Generation)

질문 → **hybrid recall** → **rerank** → 관련 md 조각 → LLM에 context로 붙여 답변.

| 단계 | 구현 | 모델 / 저장 |
|------|------|-------------|
| Chunking | `lib/indexer/chunk.ts`, `preprocess.ts` | 전처리 → `#` 섹션 → 800자/overlap 120 → `content` 임베딩 |
| Embedding | `lib/embeddings/local.ts` | **[Xenova/bge-m3](https://huggingface.co/Xenova/bge-m3)** · **1024차원** · `@xenova/transformers` bi-encoder (`EMBEDDING_MODEL`) |
| 1차 Hybrid | `lib/rag/query-hints.ts` · `lib/rag/hybrid.ts` | 키워드 + Qdrant 시맨틱 → merge `RAG_RECALL_K` |
| 2차 Rerank | `lib/rerank/local.ts` | **`BAAI/bge-reranker-v2-m3`** cross-encoder · `RERANK_MIN_SCORE` 미만 제외 |
| Graph expand | `lib/graph/` · `lib/rag/graph-expand.ts` | rerank **비활성** 시 wikilink 1-hop (기본은 rerank 우선) |
| Generation | `@cursor/sdk` · `CURSOR_MODEL` | context + 질문 → LLM 스트리밍 (기본 `composer-2.5`) |

#### 사용 모델 요약

| 용도 | Hugging Face / 설정 | 비고 |
|------|---------------------|------|
| 인덱싱·시맨틱 검색 | [Xenova/bge-m3](https://huggingface.co/Xenova/bge-m3) | `@xenova/transformers`, 1024-dim cosine, `EMBEDDING_MODEL` |
| Rerank | [BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3) | ONNX via `RERANK_MODEL`, query+passage 쌍 scoring |
| 채팅 LLM | Cursor SDK (`CURSOR_MODEL`) | API key 필요 |

> Embedding(bge-m3) **첫 로드** 시 `@xenova/transformers` 가중치 다운로드(~2.2GB), Rerank **첫 로드** 시 ONNX(~500MB)로 수 분 걸릴 수 있습니다.

### 저장소

| 저장 | 내용 |
|------|------|
| **Qdrant** (Docker) | 청크 + embedding (시멘틱 검색) |
| `data/vector-meta.json` | 인덱스 메타 |
| `data/graph.json` | wikilink 노드·엣지 |
| `{VAULT_PATH}/.company-rag/vectors.json` | Obsidian offline용 스냅샷 (`sync-index`) |

> Graph DB(Neo4j) 없음. wikilink는 `graph.json` 파일로 유지.

### Obsidian 플러그인

| 기술 | 용도 |
|------|------|
| [Obsidian API](https://docs.obsidian.md/) | Company RAG Lookup 사이드바 |
| esbuild | 플러그인 번들 (`main.js`) |
| `requestUrl` | `POST /api/search` (offline → 로컬 키워드 fallback) |

### CLI · 기타

| 명령 / 라이브러리 | 용도 |
|-------------------|------|
| `tsx` | `index` · `sync-index` · `build-graph` CLI |
| `glob` | vault md 스캔 (`INDEX_INCLUDE`) |
| `@qdrant/js-client-rest` | Qdrant REST 클라이언트 |
| `docker compose` | 로컬 Qdrant (`npm run qdrant:up`) |
| `@notionhq/client` | `npm run notion:export` (선택) |

---

## Qdrant 비용 (참고)

| 방식 | 비용 |
|------|------|
| **로컬 Docker (현재)** | Qdrant OSS **$0** — 맥 디스크·전기만 |
| [Qdrant Cloud Free](https://cloud.qdrant.io/) | 1 GB RAM · 4 GB disk · **$0** (inactivity suspend 주의) |
| Cloud Starter+ | ~$35/월~ (팀 prod) |

---

## 커밋 금지

`.env.local`, `data/`, vault 안 회사 문서·인덱스
