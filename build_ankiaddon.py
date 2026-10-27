"""Package the add-on as an .ankiaddon file (a zip of the add-on folder).

Usage: python3 build_ankiaddon.py

Leaves out what Anki doesn't need: this script, the README and screenshots,
git files, Python caches, Anki's meta.json and your own saved data in
user_files (only its README is kept, so the folder exists after install).
"""

from __future__ import annotations

import json
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
# the version comes from manifest.json ("human_version"), e.g. flashcard_emulator_v1.8.ankiaddon
with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as _f:
    VERSION = json.load(_f).get("human_version", "")
OUT = os.path.join(HERE, f"flashcard_emulator_v{VERSION}.ankiaddon" if VERSION else "flashcard_emulator.ankiaddon")

SKIP_DIRS = {".git", ".github", "__pycache__", "docs"}
SKIP_FILES = {"build_ankiaddon.py", "README.md", "CHANGELOG.md", "meta.json", ".gitignore", ".gitattributes"}


def wanted(rel: str) -> bool:
    parts = rel.split(os.sep)
    if any(p in SKIP_DIRS for p in parts[:-1]):
        return False
    name = parts[-1]
    if name in SKIP_FILES or name.endswith((".ankiaddon", ".pyc")):
        return False
    if parts[0] == "user_files":
        return rel == os.path.join("user_files", "README.txt")
    return True


def main() -> None:
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(HERE):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            for name in sorted(files):
                path = os.path.join(root, name)
                rel = os.path.relpath(path, HERE)
                if wanted(rel):
                    zf.write(path, rel.replace(os.sep, "/"))
                    count += 1
    print(f"Wrote {OUT} ({count} files)")


if __name__ == "__main__":
    main()
