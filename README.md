# Obsidian Chat Bot

Obsidian **vault 폴더** 안의 `.md`를 인덱싱해 시멘틱 검색·채팅합니다.

---

## Vault 구조

`VAULT_PATH` 아래에서 관리합니다.

```
{VAULT_PATH}/
├── notion/              # 회사 문서 md (INDEX_INCLUDE 대상)
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

---

## 사용

```bash
npm install

# vault md 인덱싱
npm run index
npm run build-graph   # [[위키링크]]만 갱신 (임베딩 없음)
npm run sync-index    # .company-rag/ 로 복사

npm run dev           # http://localhost:3000
```

md 추가·수정 후 `npm run index` → `npm run sync-index` 를 다시 실행합니다.

`INDEX_INCLUDE`로 범위를 좁히세요. vault 전체(`**/*.md`)는 파일이 많으면 수 시간 걸릴 수 있습니다.

---

## Obsidian 플러그인

```bash
cd obsidian-plugin && npm install && npm run build

mkdir -p {VAULT_PATH}/.obsidian/plugins
ln -sf /path/to/obsidian_chat_bot/obsidian-plugin {VAULT_PATH}/.obsidian/plugins/company-rag

npm run sync-index
npm run dev    # 시멘틱 검색 API (offline 시 키워드 fallback)
```

Obsidian → Community plugins → **Company RAG** ON

---

## 검색

- **시멘틱**: 질문 임베딩 → `vectors.json` 유사도 top-k
- **그래프**: 시멘틱 결과와 `[[위키링크]]`로 연결된 1-hop 이웃 노트 추가 (`npm run build-graph`는 vault `.company-rag/`에도 저장)

---

## 커밋 금지

`.env.local`, `data/`, vault 안 회사 문서·인덱스
