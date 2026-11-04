#!/usr/bin/env python3
"""Generate full-resolution, content-addressed WebP portraits (Pillow required).

Original PNGs and previously generated variants are deliberately retained.
Run from any directory: python tools/optimize-portraits.py
Review the output visually before publishing a new encoding.
"""
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import quote

from PIL import Image, __version__ as pillow_version, features

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "image-asset-manifest.json"
QUALITY = 92
SOURCES = [(f"/images/original/hero-{i:02}.png", f"hero-{i:02}") for i in range(1, 10)] + [
    ("/images/Ateşler İçinde Savaşçı Komutan.png", "commander-attack"),
    ("/images/Altın Aslanın Kale Muhafızı.png", "commander-defense"),
    ("/images/Kozmik Rünlerin Büyücü Komutanı.png", "commander-magic"),
    ("/images/Zümrüt Işığın Şifacı Kraliçesi.png", "commander-support"),
]
REFERENCES = [
    "battle-roster.json", "commander-original-roster.json", "public/hero-rarity.js",
    "public/app.js", "public/battle-preview.js", "public/index.html",
    "public/auction-commander.js",
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def immutable_write(destination, data):
    """Never change bytes behind a URL that a browser may already have cached."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if destination.read_bytes() != data:
            raise RuntimeError(f"Refusing to overwrite immutable asset: {destination}")
    else:
        with destination.open("xb") as target:
            target.write(data)


def main():
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"assets": []}
    prior_urls = {asset["source"]: asset["url"] for asset in previous["assets"]}
    assets = []
    replacements = {}
    for source, name in SOURCES:
        source_bytes = (ROOT / "public" / source.lstrip("/")).read_bytes()
        with Image.open(io.BytesIO(source_bytes)) as original:
            output = io.BytesIO()
            original.save(output, "WEBP", quality=QUALITY, method=6,
                          **({"icc_profile": original.info["icc_profile"]} if original.info.get("icc_profile") else {}))
            encoded = output.getvalue()
            if len(encoded) >= len(source_bytes):
                raise RuntimeError(f"No size saving: {source}")
            sha = digest(encoded)
            url = f"/images/optimized/{name}.{sha[:16]}.webp"
            immutable_write(ROOT / "public" / url.lstrip("/"), encoded)
            assets.append({"source": source, "sourceSha256": digest(source_bytes),
                           "sourceBytes": len(source_bytes), "url": url,
                           "sha256": sha, "bytes": len(encoded),
                           "width": original.width, "height": original.height})
        replacements[source] = url
        replacements[quote(source, safe="/")] = url
        if source in prior_urls:
            replacements[prior_urls[source]] = url

    for relative in REFERENCES:
        target = ROOT / relative
        text = target.read_text()
        # The auction dialog originally built a URL from a bare, encoded filename.
        if relative == "public/auction-commander.js":
            for source, _ in SOURCES[9:]:
                text = text.replace("portrait:'" + source.split("/")[-1] + "'",
                                    "portrait:'" + replacements[source] + "'")
            text = text.replace("portrait:'/images/'+encodeURIComponent(item.portrait)",
                                "portrait:item.portrait")
        for old, new in replacements.items():
            text = text.replace(old, new)
        target.write_text(text)

    manifest = {"version": 1, "encoding": {"format": "WebP", "quality": QUALITY,
                "method": 6, "resize": False, "pillow": pillow_version,
                "libwebp": features.version("webp")}, "assets": assets}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    before = sum(a["sourceBytes"] for a in assets)
    after = sum(a["bytes"] for a in assets)
    print(f"{len(assets)} portraits: {before:,} -> {after:,} bytes ({100 * (1 - after / before):.2f}% smaller)")


if __name__ == "__main__":
    main()
