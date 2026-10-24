# Android test preparation (2026-10-24)

This branch packages the current web game into a **separate Android test app**. It does not deploy the web server, change the live service, publish to Google Play, or include iOS work.

## What this is / is not

- `tr.com.heroauction.android.test`, displayed as **Hero Auction Test**, is a debug-only test identity, not a production package decision.
- Default build: **disconnected UI preview**, with a visible Turkish warning and disabled guest login. No simulated wallet, fake match or stub-success API is substituted.
- A configured build uses the same authoritative server APIs, roster, bot levels (5/10/15), friends, invitations, moderation and match rules as main.
- A compiled APK proves compilation only. Android installation, WebView layout, keyboard/Back gestures, background/resume, battery usage and the reported mobile freezing remain **unverified until device testing**.
- Google web sign-in and rewarded web ads are intentionally excluded from the generated Android assets. Native Google authentication needs a separate approved integration. Test guest accounts are not a durable Google-account replacement.
- Optional 3D/demo/admin screens are not part of the Android distribution. Their existing web files remain unchanged.

## Local preparation

Root server dependencies and runtime requirements are unchanged. Native tooling lives in `mobile/package.json` with its own lockfile.

Requirements: Node 22+, JDK 21, Android platform 36, Android build-tools 36.0.0. Capacitor is pinned to 8.5.3. SDK terms must be accepted by the user or with their explicit authorization; build scripts never accept licenses or install SDK packages.

```sh
npm ci
npm --prefix mobile ci
npm --prefix mobile test
npm --prefix mobile run build
export ANDROID_HOME=/path/to/authorized/android-sdk
npm --prefix mobile run doctor
npm --prefix mobile run apk:debug
```

On Windows use the equivalent environment variable syntax. For Android Studio: `npm --prefix mobile run open` after sync.

Expected debug artifact: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
Generated web assets and machine-specific SDK paths are ignored. Do not commit signing credentials, `config.local.json`, or a debug keystore. Debug signing is not release signing.

## Connecting an actual test game

1. Obtain approval to deploy this branch's backend to an **isolated HTTPS test service**, with separate test persistence. No production environment change is implied by preparing this branch.
2. Set `NATIVE_ALLOWED_ORIGINS=https://localhost` only on that test server. It is empty/off by default. The CORS adapter permits explicit GET/POST API preflight with Content-Type; it does not grant cookies, wildcard access, or replace authentication. JSON errors and authenticated SSE inherit the CORS header.
3. Use a real test database, or explicitly set `COMMANDER_TEST_GUEST_MODE=1` **on the isolated test service only**. That mode uses temporary in-memory accounts/wallets/commanders; data is not durable. Do not set it in production.
4. Copy `mobile/config.example.json` to ignored `mobile/config.local.json`. Set **both origins to the same test server**, e.g. `https://hero-test.example.com`. Keeping API and public invitation URLs on the same service is enforced to avoid sharing unrelated production room codes.
5. Rebuild and verify guest login, onboarding, bot auction/live battle, two-device room join, invitations, friends, moderation and SSE. API fetches omit cookies and reject redirects; use the canonical HTTPS host, not a redirecting alias.
6. Device-test install, cold/warm launch, offline/reconnect, expired session, tutorial cancellation, repeated Back, background during API requests, rotation/keyboard and real battle performance. Native Back preserves active matches; explicit in-game Leave is still required.

There are no Android App Links/custom-scheme claims yet. Shared invitation links open the same test **web** game; users can enter the three-digit room code in the app. Do not claim installed-app invite routing.

## Packaging boundaries

- `public/` is not edited: Google/ads exclusion, local battle-home routing, public invitation origin and lifecycle hooks are applied only to generated files.
- `HeroNative` is separate from CrazyGames `HeroPlatform`; ordinary guest/web flows remain intact.
- Only local `/api/*` fetch/EventSource URLs are rewritten. Art and scripts stay bundled.
- Native lifecycle closes/reopens the event stream using authenticated server state. A native-active guard prevents late resume requests reopening SSE after backgrounding. Server clocks and game results are never simulated or paused.
- Hardware Back dismisses keyboard/dialog/panels, protects an active match, or minimizes at the root. Unsupported external URL schemes are blocked; HTTPS links open outside the WebView. The existing support/privacy contact emails are copyable.
- Android cleartext traffic and app backup are disabled. Tokens still follow the existing game localStorage model; secure native token storage is not claimed.

## Checks

```sh
node --test *.test.js tests/*.test.* test/*.test.js
npm run audit:strict
npm --prefix mobile test
```

Preparation check: 762 root tests passed; strict audit found all 50 original heroes with images/abilities/reviewed power. Native policy/runtime/build tests cover unconfigured fail-closed behavior, mapped POST/Request bodies, SSE, link safety, privacy alias, same-server invites, tutorial cancel, repeated Back and deduplicated lifecycle. These are automated logic checks, not a physical-device report.

Browser QA in this executor is unavailable: supported cloud browser could not reach the local preview server; direct Chromium was blocked by sandbox restrictions. Do not treat this as a visual pass.

Official references: [Capacitor Android](https://capacitorjs.com/docs/android), [Capacitor 8 requirements](https://capacitorjs.com/docs/updating/8-0), [Android SDK terms](https://developer.android.com/studio/terms), [SDK package installation](https://developer.android.com/tools/sdkmanager), [Google Sign-In supported browsers](https://developers.google.com/identity/siwg/supported-browsers).

## Compiled preview evidence

2026-10-24: `:app:assembleDebug` succeeded after installing a full Temurin OpenJDK 21.0.13 (the preinstalled Java was runtime-only). Final rebuild pins every Android module to build-tools 36.0.0 and disables Gradle SDK auto-download. SDK platform 36 and platform-tools 37.0.1 are present. During the first build AGP had automatically fetched build-tools 35.0.0 and platform-tools under the authorized Android SDK license; no emulator, system image, paid service, account or release signing key was used.

The final APK's v2 signature was verified with `apksigner`; manifest identity, minimum API24 / target API36, and equality of final packaged JS/config to generated assets were checked. Config remains `configured:false`, `https://example.invalid`, `ui-preview-no-backend`.

- Filename: `Hero-Auction-Android-Disconnected-Preview-0.1.0.apk`
- Size: 71,193,785 bytes
- SHA-256: `4d5bae1d8f41e5865755010324f1da306f82219f80c9f1110f3f7dcfd64ecfe7`
- Final checks: 762/762 root regressions, 10/10 native tests, strict roster audit clean.
- Phone install / native visual QA: **not run**.

## Approved existing test-service isolation

The existing `hero-auction-commander-test` Render service can be reused without creating a new instance. Its identity is restricted to `srv-dbbn8ms9v7es73fpqkb0`. `android-test-mode.js` is default-off. The test-branch-only startup command is `node scripts/start-android-test.mjs`: it verifies `RENDER=true` and that exact service ID, sets `ANDROID_TEST_MEMORY_ONLY=1` and `NATIVE_ALLOWED_ORIGINS=https://localhost`, then imports the server. The ordinary preparation/main `npm start` remains `node server.js`.

In this mode the server never constructs a database pool, regardless of inherited `DATABASE_URL`. Existing environment values are not read back, deleted or overwritten remotely. The inherited signing secret and admin identity are ignored; auth uses a fresh random key per process. Google/CrazyGames backend sign-in is rejected before provider requests. Guest wallets, commanders, rooms, friends and moderation use existing in-memory stores and reset when the service sleeps/restarts/redeploys. A wrong Render service refuses startup before persistence/auth/timers initialize.

`GET /api/info` discloses `androidTest: {isolated:true, storage:"memory", guestOnly:true, progressionComplete:false}` only in this mode. Verify that marker and the 50-original-hero count **before** creating any remote test account/room.

Scope is gameplay/transport testing, not complete progression testing: existing preview mode does not support commander upgrades or credit multiplayer reward/refund queues to memory wallets; commander changes are free in that preview mode. These existing test-mode limitations are not production-rule changes. Bot training is free and uses the authoritative battle engine. Production database, users, balances, roster and rules are untouched.

Local guard checks instrument the PostgreSQL Pool constructor and outbound backend fetch to throw if invoked; they prove guest/onboarding/friends/moderation/bot startup works without them and inherited auth is rejected. An actual startup-wrapper integration verifies Android-origin and ordinary web clients joining the same authenticated room, both 50-gold entry debits and Android-origin SSE. This is protocol-level testing, not a phone/WebView test.
