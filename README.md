# Obsidian Chat Bot

Obsidian vault 기반 RAG(Retrieval-Augmented Generation) 회사 전용 챗봇.

로컬 `Documents` 하위 vault/레포의 마크다운을 인덱싱하고, 웹 UI에서 질문하면 관련 문서를 검색한 뒤 **Cursor SDK**로 답변을 생성합니다.

> **현재 단계:** MVP 구현 (로그인 없음)  
> **목표:** 개인 로컬 MVP → 회사 내부 배포 확장 (2차: 웍스 로그인 등)

---

## 아키텍처

```mermaid
flowchart TB
    subgraph local ["로컬 (MVP)"]
        V["Vault / Git 레포\n(.md 문서)"]
        I["인덱서\n스캔 → 청크 → 임베딩"]
        DB["벡터 DB"]
        API["Next.js API\n/chat, /index"]
        UI["웹 채팅 UI"]
        SDK["Cursor SDK"]
    end

    V --> I --> DB
    UI --> API
    API --> DB
    API --> SDK
```

| 영역 | 기술 |
|------|------|
| Framework | Next.js (App Router) 풀스택 |
| 지식 소스 | Obsidian vault / Git 레포 (`.md`) |
| 검색 | RAG (로컬 임베딩 + JSON 벡터 스토어) |
| LLM | Cursor SDK (Cursor 구독 크레딧) |
| UI | 웹 채팅 |

---

## RAG 플로우

```mermaid
sequenceDiagram
    participant U as 사용자
    participant UI as Web UI
    participant API as /api/chat
    participant VS as Vector Store
    participant LLM as Cursor SDK

    U->>UI: 질문 입력
    UI->>API: POST /api/chat
    API->>VS: 질문 임베딩 → top-k 검색
    VS-->>API: 관련 md 청크
    API->>LLM: system + context + 질문
    LLM-->>API: 스트리밍 답변
    API-->>UI: SSE / stream
    UI-->>U: 답변 표시 + 출처 링크
```

1. vault의 `.md` 파일을 스캔하고 청크 단위로 분할
2. 각 청크를 임베딩하여 벡터 DB에 저장
3. 사용자 질문과 유사한 top-k 청크를 검색
4. 검색 결과를 프롬프트 context로 조립
5. Cursor SDK로 답변 생성 (스트리밍)
6. UI에 답변 + **출처 노트 경로** 표시

---

## 프로젝트 구조

```
obsidian_chat_bot/
├── app/
│   ├── page.tsx              # 채팅 UI
│   ├── api/
│   │   ├── chat/route.ts     # RAG + Cursor SDK
│   │   ├── index/route.ts    # 재인덱싱 트리거
│   │   └── health/route.ts   # 인덱스 상태
│   └── layout.tsx
├── lib/
│   ├── indexer/              # vault 스캔, 청킹
│   ├── embeddings/           # 로컬 임베딩
│   ├── vector-store/         # 유사도 검색
│   ├── rag/                  # retrieve + prompt 조립
│   └── llm/                  # Cursor SDK 래퍼
├── components/
│   └── chat/                 # 메시지 UI, 입력창
├── data/                     # 벡터 DB (gitignore)
├── .env.local                # 비밀값 (gitignore)
└── .env.example              # 환경변수 템플릿
```

---

## API

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/api/chat` | POST | `{ message, history? }` → RAG 검색 → Cursor SDK 스트리밍 응답 |
| `/api/index` | POST | vault 재스캔 → 임베딩 → 벡터 DB 갱신 |
| `/api/health` | GET | 인덱스 상태 (문서 수, 마지막 인덱싱 시각) |

---

## 환경변수

`.env.local`에 설정합니다. **절대 Git에 커밋하지 마세요.**

```bash
VAULT_PATH=/path/to/your/vault
CURSOR_API_KEY=your_cursor_api_key
CURSOR_MODEL=composer-2.5
INDEX_INCLUDE=**/*.md
RAG_TOP_K=5
```

```bash
cp .env.example .env.local
```

---

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local 에 VAULT_PATH, CURSOR_API_KEY 설정
npm run dev
```

1. 브라우저에서 `http://localhost:3000` 접속
2. **Re-index vault** 버튼으로 `.md` 문서 인덱싱
3. 채팅창에서 질문

```bash
npm run build
npm start
```

---

## MVP vs 2차

### MVP

- Next.js 웹 채팅 UI
- 로컬 vault `.md` 인덱싱
- RAG + Cursor SDK 답변
- 수동 재인덱싱
- 출처(노트 경로) 표시
- 로그인 없음

### 2차

- 웍스 / SSO 로그인
- 팀 배포
- 코드 파일 (`.ts`, `.py` 등) 인덱싱
- vault 자동 watch / Git hook
- Slack, Obsidian 플러그인
- 부서별 vault / 접근 제어

---

## 보안

| 커밋 금지 | 이유 |
|-----------|------|
| `.env.local`, `.env` | API 키, vault 실제 경로 |
| `data/` (벡터 DB) | 회사 문서 임베딩 데이터 |
| vault 원본 / 회사 내부 URL | 민감 정보 |

공개 레포라면 README에 실제 사용자명·회사 경로를 적지 마세요.

---

## License

TBD
