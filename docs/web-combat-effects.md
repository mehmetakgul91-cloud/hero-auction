# Web combat effects — local review candidate (29 October 2026)

Base: `e0fb22d02fd6cb70016645a1d85cc2b87c082b21` (main, PR #70).
No native Android source/assets, server battle rules, stats, admin features, or
combat pacing/commander locks changed. Nothing pushed, merged or deployed.

## Presentation

- Energy/mage attacks: purple projectile, caster rune and portrait-local impact.
- Actual heal/passive-heal: green wave and gold motes/cross; actual shield,
  tank-front-shield, tank-self-shield and thorns-shield: cyan shield outline.
  A support hero's fallback attack is a golden attack, never a heal.
- Lightning: Yıldırım Hükümdarı (`original:expansion-01`) attacks, plus special
  attacks of Kael (`original:14`) and Gök Çekici (`original:expansion-29`). These
  are explicit visual identities, not a guess from translated ability strings.
- Normal melee: warm slash/sparks; archer projectile retained. Splash impacts do
  not replay the caster or beam. No full-screen impact flash.
- Existing commander targets gain an improved heal/revival wave and a localized
  lightning-shaped stun cue; buffs retain their own committed effect semantics.

Targets use committed team side, including identical heroes on opposing teams.
Older side-less passive events with duplicate IDs omit ambiguous decoration;
HP and authoritative event text remain unchanged. Status-only events do not
produce extra attacks. Damage labels remain above decorative overlays.

## Resource/accessibility behavior

Maximum 80 owned resources, three deterministic sparks per accent, CSS animation
rather than a per-frame JS particle loop. Timers, DOM effects, classes and Web
Animations cancel on rebuild, ready, disconnect, route/back/pagehide, background,
turning motion off or changing reduced-motion preference. Old repeated class
cleanup cannot clear a newer cast. Hidden/catch-up/reduced-motion frames create
no new hero effects. No camera shake or repeated lightning flashing.

## Verification

- `npm test`: 2,500/2,500 passed; zero failures/skips.
- `npm run audit:strict`: all 50 heroes have images/abilities/reviewed power.
- Focused unit/integration coverage: actual roster mapping, shield variants,
  friendly/enemy side selection, no-side ambiguity, ranged stationarity,
  resource bounds, expiry, repeated classes and interrupted animations.
- Local real server: arena page HTTP 200; demo battle API HTTP 200, two teams,
  90 committed events. Node here is 24.22.1; package engine is 26.12.1.
- **Visual browser QA is blocked/unrun**, not passed. Chromium launch hit the
  sandbox socket restriction; one escalation failed before execution. Supported
  cloud browser could not reach executor localhost, even with verified server.
  No screenshots or mobile visual approval are claimed.

Reproducible real-app QA harness (requires supported Playwright/browser runtime):

```sh
HERO_BROWSER_TEST_RUNTIME=/path/to/playwright/index.mjs \
HERO_BROWSER_SCREENSHOTS=/tmp/combat-shots \
node tools/test-combat-effects-browser.mjs
```

It starts a local server, uses real-engine deterministic teams on the real arena
page, and injects presentation events only. Covers 1440/390/320 px, five effect
families, duplicate IDs, support attacks, statuses, 100-event burst, lifecycle,
background/catch-up, reduced motion and unchanged battle state. Optional
`HERO_BROWSER_EXECUTABLE` selects an installed Chromium. The harness is syntax
checked and its fixtures validated, but browser execution remains unverified.

## Publication gate

After authorization: fetch main, rebase only if needed without overwriting admin
work, rerun full checks, push this branch and open a **draft PR**. Verify exact
remote SHA and CI. Obtain a supported non-production preview and complete actual
desktop/mobile/reduced-motion visual QA before requesting merge approval.
Draft PR/CI/preview authorization does not authorize production deploy or merge.
Native parity remains paused until the user's device is available.
