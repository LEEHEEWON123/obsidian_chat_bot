# Hermes Workspace UI (localhost:3000)

웹 UI는 **Hermes Workspace**를 씁니다. RAG 인덱싱·Qdrant·MCP는 이 레포(`obsidian_chat_bot`)가 담당합니다.

## 구조

```
브라우저 :3000  →  Hermes Workspace (~/hermes-workspace)
                      ↓
                 Hermes gateway :8642  (에이전트 두뇌, MCP 호출)
                      ↓
                 MCP obsidian_rag  →  Qdrant + ~/Documents vault
                      ↓
                 Hermes dashboard :9119  (세션·스킬·설정 API)
```

| 구성요소 | 역할 | 명령 |
|---|---|---|
| **obsidian_chat_bot** | 인덱싱, Qdrant, MCP 서버 | `npm run index`, `npm run mcp` |
| **Hermes gateway** | 멀티스텝 에이전트, API :8642 | `npm run hermes:gateway` |
| **Hermes dashboard** | 세션/스킬 API :9119 | `npm run hermes:dashboard` |
| **Hermes Workspace** | 웹 UI :3000 | `npm run workspace:dev` |

## 최초 1회

```bash
npm run hermes:setup      # ~/.hermes MCP + API server
npm run workspace:setup   # ~/hermes-workspace 클론 + .env
```

## 매일 사용

터미널 4개 (또는 gateway+dashboard+workspace 3개):

```bash
npm run qdrant:up         # Docker Qdrant (한 번)
npm run hermes:gateway    # :8642
npm run hermes:dashboard  # :9119
npm run workspace:dev     # :3000 ← 여기서 채팅
```

문서 추가/변경 후: `npm run index`

## NAVER Works DM 공유 (개인 전송 + 승인)

문서 요약을 동료 Works DM으로 보내려면:

1. NAVER Works Developer Console에서 앱 + Bot + Service Account JWT 키
   → `NAVER_WORKS_CLIENT_ID/SECRET/SERVICE_ACCOUNT/BOT_ID` + private key
   → Scope: `bot bot.message bot.read directory.read`
2. `cp config/share-people.example.json config/share-people.json` 후
   `naverWorksUserId` 채우기
3. Workspace: "A씨에게 … 요약 보내줘" → 초안 확인 → "보내"

공개 채널 로그/학습은 나중에. 지금은 **개인 DM만**.

## 인덱싱 범위

`.env.local`의 `INDEX_INCLUDE`:

- `dobedub/**/*.md` (notion, dubright, pudding, vogopang 전부 포함)

Hermes가 vault 검색할 때 `AGENTS.md` + MCP `pathPrefix`/`rootFolder: "dobedub"`로 스코프합니다.

## 구 UI (Next.js ChatPanel)

`npm run dev` → **:3001** (Cursor SDK 1-shot RAG). Workspace(:3000)가 메인 UI입니다.

## 연결 확인

```bash
curl http://127.0.0.1:8642/health
curl http://127.0.0.1:9119/api/status
```

Workspace Settings → Connection에서 `HERMES_API_URL` / `HERMES_DASHBOARD_URL` 확인.
