"""Verify the built APK contains the optimized local assets, not source copies."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

apk = Path(sys.argv[1])
mobile = Path(__file__).resolve().parents[1]
report = json.loads((mobile / "package-report.json").read_text())
package = json.loads((mobile / "package.json").read_text())
config_path = mobile / "config.local.json"
expected_config = json.loads((config_path if config_path.exists() else mobile / "config.example.json").read_text())
# Android's ZIP writer stores UTF-8 filenames without always setting bit 11.
# Read Turkish commander names the same way Android AssetManager does.
with zipfile.ZipFile(apk, metadata_encoding="utf-8") as archive:
    names = set(archive.namelist())
    manifest = json.loads(archive.read("assets/public/native-files.json"))
    for name, digest in manifest.items():
        assert hashlib.sha256(archive.read("assets/public/" + name)).hexdigest() == digest, name
    source = json.loads(archive.read("assets/public/native-build.json"))
    assert source["version"] == package["version"]
    assert source["gameSource"] == json.loads((mobile / "game-source.json").read_text())
    aliases = json.loads(archive.read("assets/public/native-image-aliases.json"))
    assert aliases == json.loads((mobile / "www/native-image-aliases.json").read_text())
    for original, destination in aliases.items():
        assert "assets/public" + original not in names, original
        assert destination.endswith(".lossless.webp")
        assert "assets/public/" + destination in names, destination
    for item in report["retained"]:
        local = (mobile / "www" / item["path"]).read_bytes()
        assert archive.read("assets/public/" + item["path"]) == local, item["path"]
    for item in report["omitted"]:
        assert "assets/public/" + item not in names, item
    for name in names:
        assert not name.startswith("assets/public/images/") or name.removeprefix("assets/public/") in {item["path"] for item in report["retained"]}, name
        assert not name.startswith(("assets/public/arena-3d", "assets/public/models/", "assets/public/admin")), name
    config = archive.read("assets/public/native-config.js").decode()
    assert config == (mobile / "www/native-config.js").read_text()
    assert source["apiOrigin"] == expected_config["apiOrigin"]
    assert archive.read("assets/public/audio/hero-auction-senkron-davul-bas-2dk.mp3") == (mobile / "www/audio/hero-auction-senkron-davul-bas-2dk.mp3").read_bytes()
size = apk.stat().st_size
assert size < 45_000_000, f"APK size regression: {size}"
print(json.dumps({"file": apk.name, "bytes": size, "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(), "heroCount": report["heroCount"], "omittedImages": sum(Path(p).suffix in {".png", ".webp", ".svg"} for p in report["omitted"])}, indent=2))

