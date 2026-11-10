# Distinct home Play artwork

The home Play tile now uses the approved blue-and-gold crossed-swords arena
illustration instead of the Attack Commander portrait. The Commander tile and
all commander portrait mappings are unchanged.

- Asset: `public/images/optimized/home-play-arena.da9037bd905f1998.webp`.
- Image: 768 × 512, 67,486 bytes, generated artwork optimized to WebP.
- SHA-256: `da9037bd905f1998a4330f9aa6c86a2feb43fecdecaccb16967dcc481c02298a`.
- The play-only CSS crop uses the full art container, centered at 45%, with a
  lower fade to retain a clear label on the existing pale menu tile.
- The navigation button ID, accessible name, decorative empty image alt,
  controls, sizing and click behavior are retained. The CSS URL is versioned.
- No gameplay code, economy, account data, Android build or deployment changes.

## Checks

`node --test tests/home-play-artwork.test.mjs` covers the distinct source, asset
hash and size, accessibility/navigation hooks, scoped CSS, and real HTTP image
responses from both the normal website and CrazyGames paths.

`tools/test-home-play-artwork-browser.mjs` is an isolated browser fixture using
the production navigation markup, CSS and image files without authentication,
API requests or third-party network access. It checks the image, label, touch
target, overflow, keyboard focus and unchanged Commander source at 320, 393,
550, 620, 768 and 1280 px in Turkish and English.

Run it with an installed Playwright browser. Optional environment variables:
`HERO_BROWSER_TEST_RUNTIME` (Playwright module path), `HERO_BROWSER_EXECUTABLE`
(browser path), and `HERO_BROWSER_SCREENSHOTS` (output directory).

In the preparation environment, browser QA remains unverified: local Chromium
cannot start because its process-singleton socket is unavailable, and the
cloud browser cannot connect to the local test server. The browser test syntax,
unit/integration tests, and strict card audit were checked separately.

Preparation verification: all 3,173 automated tests passed, `audit:strict`
reported no problems across all 50 heroes, and `git diff --check` passed.
These checks do not substitute for the pending browser visual test.
