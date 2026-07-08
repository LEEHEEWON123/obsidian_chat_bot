#!/usr/bin/env bash
# Obsidian company-rag 플러그인 재설치 (폴더 이동 후 1회 실행)
set -euo pipefail

SRC="$HOME/Documents/side-projects/obsidian_chat_bot/obsidian-plugin"
DEST="$HOME/Documents/.obsidian/plugins/company-rag"

# 깨진 symlink 제거 (obsidian_chat_bot 이동 전 symlink 잔재)
if [[ -L "$DEST" ]] || [[ -e "$DEST" ]]; then
  rm -rf "$DEST"
fi

mkdir -p "$DEST"
cp "$SRC/manifest.json" "$SRC/main.js" "$SRC/styles.css" "$DEST/"

python3 - <<'PY'
import json
from pathlib import Path
p = Path.home() / "Documents/.obsidian/community-plugins.json"
p.write_text(json.dumps(["company-rag"], indent=2) + "\n")
print("enabled company-rag")
PY

echo "Done → $DEST"
ls -la "$DEST"
