#!/usr/bin/env bash
set -uo pipefail
mkdir -p artifacts
adb logcat -c
# Resizing an already booted Pixel image can leave its launcher in an ANR.
# Stop only the fixture launcher, never the game, before instrumentation starts.
adb shell am force-stop com.google.android.apps.nexuslauncher
adb shell wm dismiss-keyguard
cd mobile/android
# Only run the application's tests, not the bundled Capacitor library projects'
# unrelated sample suites and their legacy Kotlin test dependencies.
./gradlew --no-daemon :app:connectedDebugAndroidTest
result=$?
cd ../..
# Do not publish auth query strings from Capacitor's verbose local-request log.
adb logcat -d -s HeroSmoke:I Capacitor/Console:E AndroidRuntime:E chromium:E > artifacts/device-errors.txt
adb exec-out screencap -p > artifacts/device-last-screen.png
for stage in auction auction-bids formation formation-ready arena arena-controls result; do
  adb pull "/sdcard/Download/hero-portrait-$stage.png" "artifacts/$stage.png" || rm -f "artifacts/$stage.png"
done
exit "$result"

