"""Run from any directory after adding photos to data/images/<PointID>/."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
images = root / "data" / "images"
manifest = {}
for folder in sorted(images.iterdir()):
    if folder.is_dir():
        files = [p.relative_to(images).as_posix() for p in sorted(folder.iterdir())
                 if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif"}]
        if files:
            manifest[folder.name] = files
(root / "data" / "image-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Indexed {sum(map(len, manifest.values()))} photos for {len(manifest)} points.")
