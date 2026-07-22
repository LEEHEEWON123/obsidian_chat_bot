#!/usr/bin/env python3
"""CLIP index / search for AX case thumbnails.

Images: clip-ViT-B-32
Queries (KO/EN): clip-ViT-B-32-multilingual-v1 (same vector space)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULT_IMAGE_MODEL = "sentence-transformers/clip-ViT-B-32"
DEFAULT_TEXT_MODEL = "sentence-transformers/clip-ViT-B-32-multilingual-v1"


def load_model(model_name: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def cmd_index(args: argparse.Namespace) -> int:
    from PIL import Image
    import csv

    case_dir = Path(args.case_dir)
    assets_csv = case_dir / "data" / "assets.csv"
    if not assets_csv.exists():
        print(f"missing {assets_csv}", file=sys.stderr)
        return 1

    rows = []
    with assets_csv.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    image_model = load_model(args.image_model)
    items = []
    for row in rows:
        asset_id = row.get("소재번호", "").strip()
        preview = row.get("미리보기경로", "").strip()
        if not asset_id or not preview:
            continue
        image_path = case_dir / preview
        if not image_path.exists():
            print(f"skip missing image: {image_path}", file=sys.stderr)
            continue
        image = Image.open(image_path).convert("RGB")
        vector = image_model.encode(image, normalize_embeddings=True)
        items.append(
            {
                "assetId": asset_id,
                "fileName": row.get("파일명", ""),
                "fileType": row.get("파일유형", ""),
                "previewPath": preview,
                "tags": [t for t in (row.get("기존태그") or "").split("|") if t],
                "vector": vector.tolist(),
            }
        )
        print(f"indexed {asset_id} ({preview})", file=sys.stderr)

    out = {
        "imageModel": args.image_model,
        "textModel": args.text_model,
        "dim": len(items[0]["vector"]) if items else 0,
        "caseDir": str(case_dir),
        "items": items,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "count": len(items), "out": str(out_path)}))
    return 0


def cosine(a, b) -> float:
    return float(sum(x * y for x, y in zip(a, b)))


def cmd_search(args: argparse.Namespace) -> int:
    index_path = Path(args.index)
    if not index_path.exists():
        print(f"missing index: {index_path}", file=sys.stderr)
        return 1

    payload = json.loads(index_path.read_text(encoding="utf-8"))
    text_model_name = (
        args.text_model
        or payload.get("textModel")
        or DEFAULT_TEXT_MODEL
    )
    text_model = load_model(text_model_name)
    query_vec = text_model.encode(args.query, normalize_embeddings=True).tolist()

    scored = []
    for item in payload.get("items", []):
        score = cosine(query_vec, item["vector"])
        scored.append(
            {
                "assetId": item["assetId"],
                "fileName": item.get("fileName", ""),
                "fileType": item.get("fileType", ""),
                "previewPath": item.get("previewPath", ""),
                "tags": item.get("tags", []),
                "score": score,
            }
        )
    scored.sort(key=lambda x: x["score"], reverse=True)
    top_k = max(1, min(int(args.top_k), 50))
    print(
        json.dumps(
            {
                "query": args.query,
                "textModel": text_model_name,
                "imageModel": payload.get("imageModel"),
                "count": top_k,
                "results": scored[:top_k],
            },
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="AX case CLIP index/search")
    sub = parser.add_subparsers(dest="command", required=True)

    p_index = sub.add_parser("index", help="Embed thumbnails into JSON index")
    p_index.add_argument("--case-dir", required=True)
    p_index.add_argument("--out", required=True)
    p_index.add_argument("--image-model", default=DEFAULT_IMAGE_MODEL)
    p_index.add_argument("--text-model", default=DEFAULT_TEXT_MODEL)
    p_index.set_defaults(func=cmd_index)

    p_search = sub.add_parser("search", help="Text-to-image CLIP search")
    p_search.add_argument("--index", required=True)
    p_search.add_argument("--query", required=True)
    p_search.add_argument("--top-k", default="5")
    p_search.add_argument("--text-model", default="")
    p_search.set_defaults(func=cmd_search)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
