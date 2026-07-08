#!/usr/bin/env bash
# dobedub/ + side-projects/ 재구조화
# 그 외 vault 루트 항목은 그대로 둠.
#
#   DRY_RUN=1 bash scripts/vault-restructure.sh
#   DRY_RUN=0 bash scripts/vault-restructure.sh

set -euo pipefail

VAULT="${VAULT_PATH:-$HOME/Documents}"
DRY_RUN="${DRY_RUN:-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

mv_dir() {
  local src="$1" dest="$2"
  if [[ ! -e "$VAULT/$src" ]]; then
    echo "  skip (없음): $src"
    return
  fi
  if [[ -e "$VAULT/$dest" ]]; then
    echo "  skip (대상 존재): $src → $dest"
    return
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [dry-run] mv $src → $dest"
  else
    mkdir -p "$(dirname "$VAULT/$dest")"
    mv "$VAULT/$src" "$VAULT/$dest"
    echo "  moved: $src → $dest"
  fi
}

echo "Vault: $VAULT"
echo "Mode: $([ "$DRY_RUN" == "1" ] && echo 'DRY-RUN' || echo 'LIVE')"
echo ""

# ── dobedub/ (회사: notion + dubright + pudding + vogopang) ───────
echo "== dobedub/ =="
mv_dir "notion"                         "dobedub/notion"
mv_dir "dubright_front"                 "dobedub/dubright_front"
mv_dir "dubright_backend"               "dobedub/dubright_backend"
mv_dir "dobedub_front_archive"          "dobedub/dobedub_front_archive"
mv_dir "dobedub_library_front"          "dobedub/dobedub_library_front"
mv_dir "dobedopop_front"                "dobedub/dobedopop_front"
mv_dir "labeling_front"                 "dobedub/labeling_front"
mv_dir "labeling_back"                  "dobedub/labeling_back"
mv_dir "pudding_front"                  "dobedub/pudding_front"
mv_dir "vogopang_front"                 "dobedub/vogopang_front"
mv_dir "vogopang_back"                  "dobedub/vogopang_back"
mv_dir "vogopang-b2c-app"               "dobedub/vogopang-b2c-app"
mv_dir "vogopang-brochure"              "dobedub/vogopang-brochure"
mv_dir "vogopang-library-back-office"   "dobedub/vogopang-library-back-office"
mv_dir "vogopang-partner-back-office"   "dobedub/vogopang-partner-back-office"
mv_dir "vogopang-telegram-bot"          "dobedub/vogopang-telegram-bot"

# ── side-projects/ (GitHub 레포) ─────────────────────────────────
echo ""
echo "== side-projects/ =="
SIDE_REPOS=(
  obsidian_chat_bot harness_build about-me web-vital-cheking
  kakao_mcp_server kakao_mcp_gift_find AX_TEST panorama_app
  horror_game village-run lucky-defense nugu-seyo face-fortune
  call-distance-tracker legal-recorder-hybrid gomoku_algorithm_test llm_test
)
for repo in "${SIDE_REPOS[@]}"; do
  if [[ "$repo" == "obsidian_chat_bot" && "$DRY_RUN" == "0" ]]; then
    continue
  fi
  mv_dir "$repo" "side-projects/$repo"
done

echo ""
if [[ "$DRY_RUN" == "1" ]]; then
  echo "완료 (dry-run). 실제 이동: DRY_RUN=0 bash scripts/vault-restructure.sh"
else
  echo "== obsidian_chat_bot (마지막) =="
  if [[ -d "$REPO_DIR/.git" && "$REPO_DIR" == "$VAULT/obsidian_chat_bot" ]]; then
    mkdir -p "$VAULT/side-projects"
    mv "$VAULT/obsidian_chat_bot" "$VAULT/side-projects/obsidian_chat_bot"
    echo "  moved: obsidian_chat_bot → side-projects/obsidian_chat_bot"
    echo ""
    echo "⚠ Cursor 워크스페이스를 다시 여세요:"
    echo "   $VAULT/side-projects/obsidian_chat_bot"
  else
    mv_dir "obsidian_chat_bot" "side-projects/obsidian_chat_bot"
  fi
  echo ""
  echo "완료. .env.local / AGENTS.md 업데이트 후 npm run index"
fi
