#!/usr/bin/env bash
set -uo pipefail
mkdir -p artifacts
adb logcat -c
adb logcat -s HeroSmoke:I > artifacts/device-progress.txt &
log_pid=$!
trap 'kill "$log_pid" 2>/dev/null || true' EXIT
# Resizing an already booted Pixel image can leave its launcher in an ANR.
# Stop only the fixture launcher, never the game, before instrumentation starts.
echo 'Resetting resized fixture launcher (15-second limit)'
timeout 15s adb shell am force-stop com.google.android.apps.nexuslauncher || true
timeout 15s adb shell wm dismiss-keyguard || true
echo 'Starting app instrumentation (7-minute limit)'
cd mobile/android
# Only run the application's tests, not the bundled Capacitor library projects'
# unrelated sample suites and their legacy Kotlin test dependencies.
timeout --signal=TERM --kill-after=10s 7m ./gradlew --no-daemon :app:connectedDebugAndroidTest
result=$?
cd ../..
# Do not publish auth query strings from Capacitor's verbose local-request log.
timeout 15s adb logcat -d -s HeroSmoke:I Capacitor/Console:E AndroidRuntime:E chromium:E > artifacts/device-errors.txt
timeout 15s adb exec-out screencap -p > artifacts/device-last-screen.png
timeout 15s adb shell dumpsys window windows > artifacts/device-windows.txt
for stage in auction auction-bids auction-review formation formation-ready arena arena-controls result failure; do
  timeout 15s adb pull "/sdcard/Download/hero-portrait-$stage.png" "artifacts/$stage.png" || rm -f "artifacts/$stage.png"
done
exit "$result"

