"""Set fixture display geometry before boot, avoiding live compositor resizing."""
import os
from pathlib import Path
import re
import sys

size = sys.argv[1]
if not re.fullmatch(r"\d{3,4}x\d{3,4}", size):
    raise SystemExit("Expected WIDTHxHEIGHT")
width, height = map(int, size.split("x"))
assert 320 <= width < height <= 2560
avd_root = Path(os.environ.get("ANDROID_AVD_HOME", str(Path.home() / ".android/avd")))
config = avd_root / "test.avd/config.ini"
values = dict(line.split("=", 1) for line in config.read_text().splitlines() if "=" in line)
values.update({"hw.lcd.width": str(width), "hw.lcd.height": str(height),
               "hw.lcd.density": "320", "skin.name": size, "skin.path": "_no_skin",
               "showDeviceFrame": "no"})
config.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
print(f"Configured native fixture display: {size}, density 320")
