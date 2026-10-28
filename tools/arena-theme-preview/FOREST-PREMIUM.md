# Approved forest artwork — forest-only release candidate

Base carrier: `911365a75a5cac9fc2e5b3c9c395b067b2b34141`, tree
`bd8ed1251535c2a85b3235705dd0bdc4bd65d9ab`, verified by the release owner as
byte-equivalent to live merge `7710ec422d50b64165f797557c522eaecd35786c`.
This includes the current independent front/back lane spacing over 60 tracks.
No code/art from the rejected five-scene SVG revision is included.

## Approved source and derivative

Original is retained unchanged in the owner’s private Library.
Filename: `HeroAuction-Orman-Arenasi-Premium-Konsept.png`.
Original: 1024x1536 RGB PNG, 3,887,459 bytes, SHA256
`ba44da77ad99db1073a9641f2aa2c0887381db474cd05ab1cd45a20eb7f6edb4`.
The approved image was materialized through Library, its hash verified, and its
actual pixels inspected. The original Library item is unchanged.

Web delivery: `public/images/arena-themes/ruins-premium.webp`, same 1024x1536
resolution; Pillow WebP quality92/method6, 756,854 bytes (80.5% smaller).
SHA256: `deeeda596bce940f360c11e60b931bd9b1b53320d075392d6e2bf0e1ae090056`.
Only lossy delivery compression was applied: no repaint, resizing, recolouring,
new drawing or generated extension of the approved image.

The active pool is forest-only per the subsequent user instruction. The four
retired IDs and their original SVGs remain archived/readable. Old saved rooms
map to forest without rewriting combat state; one-option rematches never draw
from an empty pool. CSS uses cover, desktop center18% and
mobile center-center, preserving proportions rather than stretching. There is
no dark vignette over this scene. Existing translucent team-edge cues remain;
small dark name backplates ensure AA contrast even over white highlights.
Other four theme asset files, economy, combat RNG, heroes,
positions, timers, DOM, overflow, hit areas and stacking are unchanged.
No preload script/link was added. Only forest is referenced by active arena CSS;
retired images are not eagerly requested. Browser network loading was not measured.

## Preview provenance

The two PNGs are labelled **layout mockups, not browser screenshots**. They use
the actual production renderer's names/art/rarity and its latest 60-track lane
placement. HP/shield values are samples. Artwork in the mockup is decoded from
the exact WebP delivery file; six existing hero WebPs are losslessly converted
to PNG only because Inkscape here lacks WebP decoding. No hero repainting.

Fitted card dimensions are approximated from current CSS. Desktop arena990x530;
mobile logical canvas390px with378x530 arena. Source SVG is rendered using the
permitted Inkscape route, not a browser workaround. This is not evidence of
browser CSS/touch/scroll/FX behaviour or of a live deployment.

Reproduce: run `node tools/arena-theme-preview/render-samples.mjs`, then
`python tools/arena-theme-preview/build-forest-composites.py` with the approved
WebP decoded to `artifacts/forest-premium/forest-web-delivery.png`; use Inkscape
to render the emitted SVGs. Python Pillow and DejaVu Sans fonts are required.

## Validation

- Focused theme/forest/viewport: 23 passed, 0 failed/skipped.
- Aggregate `node --test *.test.js tests/*.test.* test/*.test.js`: 1,947 passed,
  0 failed/skipped (24.5 seconds).
- Strict active-hero audit: all50; no problems.
- `git diff --check`: clean.
- Actual final mobile and desktop PNG pixels inspected.
- Browser/interactive live testing not performed; no account/game actions.

Local backup, PNGs and logs: `artifacts/forest-premium/` (outside git).
Publication was subsequently authorised on 2026-10-26 at14:21UTC.
Release requires exact-tree PR CI success and live Render/source verification.
