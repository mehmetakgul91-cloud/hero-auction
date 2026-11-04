# Versioned portrait optimization

## Scope

This change replaces live references to nine original hero PNGs and four commander
PNGs with full-resolution WebP derivatives. It does not resize, crop, redraw or
replace the source artwork. All original PNGs remain byte-for-byte intact.
Gameplay, polling, audio, database schema and API behavior are unchanged.

The 13 selected files total **39,251,653 bytes before** and **7,308,020 bytes after**,
a reduction of **31,943,633 bytes (81.38%)**. This is the encoded-file measurement,
not an estimate of per-visit downloads, production egress or billing savings.
Per-file measurements are in `portrait-optimization-measurements.json`.

WebP quality is 92, method 6. Hero images remain 1374 × 1145; commander images
remain 1024 × 1536. All sources are opaque RGB images. Original/derivative contact
sheets and native-resolution crops were visually inspected. FFmpeg SSIM ranges
from 0.984215 to 0.991485; WebP is lossy, and SSIM is supporting evidence rather
than proof of identical pixels or a replacement for in-game/device review.

## Cache and invalidation contract

- Every derivative URL contains the first 16 hexadecimal characters of its
  SHA-256. `image-asset-manifest.json` stores the full hash, source hash, byte sizes
  and dimensions.
- `versioned-portrait-assets.js` verifies actual deployed bytes against the
  manifest once at process startup. Only exact verified image paths join the
  existing immutable allowlist. Missing files, incorrect sizes, modified bytes,
  forged paths and hash mismatches fail closed to the existing `no-store` policy.
- The normal and CrazyGames routes serve identical image bytes with
  `Cache-Control: public, max-age=31536000, immutable`.
- Do not modify deployed files in place. A new encoding or image revision must
  receive a new hash URL. Keep previously generated variants available for
  already-open clients and old releases. The generator never overwrites a hash
  URL with different bytes and never deletes older variants.
- This change does not give mutable HTML, JavaScript, CSS, old images or MP3s a
  long cache lifetime. Arbitrary `?v=` parameters never enable immutable caching.
  Authenticated JSON keeps `no-store`, and SSE keeps its existing `no-cache`.
  CrazyGames' transformed HTML/JS remain `no-store`.

## Regenerate

Run `python tools/optimize-portraits.py` with Pillow installed. The checked-in
manifest records Pillow 13.0.0 and libwebp 1.6.0. The script updates both roster
files and every active portrait lookup/HTML reference, including auction dialogs
and the independent result-portrait table. A repeat run with the same encoder
and sources was byte-identical. A different encoder can produce a new hash;
inspect those results before publishing.

Commit the new variants, manifest, and updated references together. Never delete
source PNGs or old hash variants as part of this update.

## Validation

- `npm test`: 2,822/2,822 passed, including real HTTP cache/API privacy checks.
  The full suite passed on both Node 24.22.1 and the required Node 26.12.1.
- `npm run audit:strict`: passed on both runtimes; all 50 active portraits,
  abilities and powers valid.
- `node --test tests/versioned-portraits.test.mjs`: source identity, dimensions,
  size reduction, cache allowlist, invalidation, normal/CrazyGames byte equality,
  legacy URL compatibility, authenticated API privacy, SSE and traversal checks.
- `node tools/test-versioned-portraits-browser.mjs`: optional Playwright browser
  check for cold/warm loads, 390/1440-pixel galleries, repeated detail dialogs and
  four-commander onboarding. `HERO_BROWSER_TEST_RUNTIME` can select an existing
  Playwright module; `HERO_BROWSER_EXECUTABLE` can select installed Chromium.
  Local Chromium launch was blocked by the execution environment's IPC socket
  restriction. Real Chromium 141.0.7390.37 subsequently passed the isolated
  [GitHub Actions browser run](https://github.com/mehmetakgul91-cloud/hero-auction/actions/runs/41908656725)
  on 2026-11-04. All 13 images transferred 7,311,920 bytes on a cold load and
  0 bytes on the warm navigation, independently for normal and CrazyGames paths.
  Both gallery widths, repeated detail dialogs and all four commander images
  passed. The harness waits for all 50 gallery images and painting before taking
  screenshots; review the latest PR run's artifacts for the current head.
  The initial browser attempt sampled timing records too early; the corrected
  test waits for complete Resource Timing entries without weakening cold/warm
  assertions. No production deployment has been performed.
- `.github/workflows/versioned-portraits-browser.yml` prepares the same browser
  checks on an isolated GitHub Actions runner, with read-only repository
  permissions, no production database and downloadable screenshots/results.
  This is isolated test evidence, not a production-traffic or billing measurement.

The existing lane-balance baseline hashes are retained. Their tests normalize
only the nine exact portrait URL substitutions before comparing the historical
roster hash, so unrelated stats, abilities, lane bonuses and metadata remain
protected by the original baseline.
