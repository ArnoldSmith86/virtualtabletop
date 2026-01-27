#!/usr/bin/env python3
"""Remove library/games/*/assets/* files not referenced in any of the game's JSON files."""

import os
from pathlib import Path

LIBRARY_GAMES = Path(__file__).resolve().parent / "library" / "games"

def main():
    removed = 0
    for game_dir in LIBRARY_GAMES.iterdir():
        if not game_dir.is_dir():
            continue
        assets_dir = game_dir / "assets"
        if not assets_dir.is_dir():
            continue

        json_content = ""
        for f in game_dir.glob("*.json"):
            json_content += f.read_text(encoding="utf-8", errors="replace")

        for asset_file in list(assets_dir.iterdir()):
            if not asset_file.is_file():
                continue
            if asset_file.name not in json_content:
                asset_file.unlink()
                print(asset_file)
                removed += 1

    print(f"\nRemoved {removed} unreferenced asset(s).")

if __name__ == "__main__":
    main()
