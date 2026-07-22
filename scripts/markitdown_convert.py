#!/usr/bin/env python3
"""Convert a single Office file to Markdown via MarkItDown. Prints UTF-8 markdown to stdout."""

from __future__ import annotations

import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: markitdown_convert.py <input-file>", file=sys.stderr)
        return 2

    input_path = sys.argv[1]

    try:
        from markitdown import MarkItDown
    except ImportError:
        print(
            "markitdown is not installed. Run:\n"
            "  pip3 install -r requirements-docx.txt",
            file=sys.stderr,
        )
        return 1

    md = MarkItDown()
    result = md.convert(input_path)
    text = getattr(result, "text_content", None) or str(result)
    sys.stdout.write(text if text.endswith("\n") else text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
