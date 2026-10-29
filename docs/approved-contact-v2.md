# Approved target contact v2 (local implementation)

Reference: Library `libfile_63279bcb12a081919a30b43f4023ff0f`, version 2,
file `file_00000000a49c81f5978b3bc2c8752963`.
The reference is an isolated animation prototype, **not game footage**.
Decoded by elapsed time (1430ms), not frame index: GIF optimizes identical frames.

- Exact Python `random.Random(84)` 68-particle tuples retained in
  `public/hero-contact-particles.js`. Deterministic evenly distributed subsets:
  32 normal / 44 special at 54px, square-root size scaling, hard cap 68.
- 190×232 reference portrait; local contact at 30% width, 59.5% height,
  horizontally mirrored for attacks from the other side. Face and HP excluded.
- Warm-white soft 23px core; directional ballistic sparks, drag 3, gravity 42,
  original 0.65–1.12s particle lifetimes. No damage glyphs, rings, runes, X or box.
- Reference particle time maps into existing 800/1060ms impact window.
  Source/flight 240+360 / 360+480 and total beats 1400/1900ms unchanged.
- A single owned contact trigger draws the first frame and emits cosmetic damage
  text. Authoritative HP and damage calculations are untouched. Shared-cast
  targets use one arrival deadline; lethal/self/reduced-motion arrival is zero.
  Heal/shield text timing and semantic artwork are unchanged.
- One canvas per contact, capped DPR 2; bounded casts/targets/resources. Clear
  owns pending timers and latest RAF. Death/removal invalidates pending impact;
  catch-up, background, route, disconnect and result clear outstanding cosmetics.
  Late callbacks after the impact window are dropped, not replayed.
- Reduced motion: a minimal static warm contact mark plus static damage text;
  no source/flight movement or flash.

## Verification and limitations

Unit tests cover exact arrival, special/clamped/instant timing, duplicate target,
shared cast, stale callbacks, removal, death, cancellation and latest RAF cleanup.
HP threshold tests cover fractional HP below 20% red, otherwise green.

Offline comparison generated from the actual JS `contactFrame` samples against
actual decoded reference pixels at 190px and 54px. PIL approximates canvas glow
and rasterization: this is **not browser rendering or game footage**.
Browser script `tools/test-approved-contact-browser.mjs` is prepared but unverified;
local startup stopped on a missing dependency before Chromium launched. It was
not retried after learning of the environment's prior browser/socket denial.
Run only in an authorized browser-capable environment/CI after publication approval.

No source movement, server timing, damage, death logic, commander rules, economy
or native code changed in this patch. No publication is authorized by this commit.

Local final verification: `npm test` **2543 passed / 0 failed**; `npm run
 audit:strict` **50/50, no problems**; `git diff --check`, browser-script syntax,
and workflow YAML parsing passed. Runtime here: Node 24.22.1; CI uses the
repository's Node 26.12.1. The prepared browser workflow is not a browser pass.

Publication follow-up: draft-PR/isolated-CI publication was explicitly approved.
Shared instant-arrival targets now suppress orphan source/flight/lunge even when
an earlier dead splash establishes the group clock. Final local suite after this
fix: **2544 passed / 0 failed**, strict audit **50/50**. Browser CI remains pending;
merge and production deployment are not authorized.

Isolated browser verification (PR #75): run 40949730101 passed normal600ms and
special840ms damage creation/visible-first-frame checks, actual canvas rendering,
390/1440px viewports, route/disconnect cancellation, reduced static cleanup,
unchanged authoritative teams, and fractional HP warning/healing colors.
CSS animation time is explicitly sampled for deterministic screenshots; this
is controlled browser rendering, not an unmodified live-match recording.
Artifacts: `approved-contact-browser-frames` (12931111487).
The media-change test awaits the actual event before emitting the next action.
The browser runner is pinned to Ubuntu24.04 (Playwright1.56.1 does not support
Ubuntu26.04). Final local runtime suite after visible-first-frame correction:
**2545 passed / 0 failed**, strict audit **50/50**.
