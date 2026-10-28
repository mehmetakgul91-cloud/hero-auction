#!/usr/bin/env bash
set -uo pipefail
mkdir -p artifacts
timeout 15s adb logcat -c
adb logcat -s HeroSmoke:I > artifacts/device-progress.txt &
log_pid=$!
trap 'kill "$log_pid" 2>/dev/null || true' EXIT
# Display dimensions are configured before boot; never resize a live compositor.
timeout 15s adb shell wm size > artifacts/device-display.txt
timeout 15s adb shell wm density >> artifacts/device-display.txt
timeout 15s adb shell settings get system font_scale >> artifacts/device-display.txt
timeout 15s adb shell wm dismiss-keyguard || true
echo 'Starting app instrumentation (7-minute limit)'
# Both APKs were compiled before emulator boot. Run the same AndroidJUnitRunner
# directly so a second Gradle JVM/UTP process does not compete with the emulator.
free -m > artifacts/host-memory-before.txt
result=1
if timeout 90s adb install -r -t mobile/android/app/build/outputs/apk/debug/app-debug.apk &&
   timeout 90s adb install -r -t mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk; then
  timeout --signal=TERM --kill-after=10s 7m adb shell am instrument -w \
    tr.com.heroauction.android.test.test/androidx.test.runner.AndroidJUnitRunner \
    > artifacts/instrumentation.txt 2>&1
  result=$?
  cat artifacts/instrumentation.txt
  # am instrument can return zero after a test failure. Require the entire
  # three-test suite's success summary, never infer success from exit code alone.
  if ! grep -qE '^OK \(3 tests\)[[:space:]]*$' artifacts/instrumentation.txt ||
     grep -qE 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=' artifacts/instrumentation.txt; then
    result=1
  fi
fi
free -m > artifacts/host-memory-after.txt
sudo dmesg --ctime 2>/dev/null | tail -100 > artifacts/host-kernel-tail.txt
# Do not publish auth query strings from Capacitor's verbose local-request log.
timeout 15s adb logcat -d -s HeroSmoke:I Capacitor/Console:E AndroidRuntime:E chromium:E > artifacts/device-errors.txt
timeout 15s adb exec-out screencap -p > artifacts/device-last-screen.png
timeout 15s adb shell dumpsys window windows > artifacts/device-windows.txt
for stage in auction auction-bids auction-review formation formation-ready arena arena-controls result failure; do
  timeout 15s adb pull "/sdcard/Download/hero-portrait-$stage.png" "artifacts/$stage.png" || rm -f "artifacts/$stage.png"
done
exit "$result"
