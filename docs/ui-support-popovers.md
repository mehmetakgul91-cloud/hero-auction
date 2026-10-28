# Compact support and account dismissal — 28 October 2026

## Scope

Prepared locally from production main `7e81c9e65dd73d91ab8124e9cfa0d04ffe19d8c0` (PR65).
The separate Android draft PR66 is not changed. No publication, deploy, real
account logout, report submission, admin action, music/audio, gameplay or economy
change is included.

## Root causes and changes

- The account button previously only toggled the logout button's `hidden` and
  `aria-expanded` values. There was no outside-input, focus, Escape or navigation
  dismissal. `account-popover.js` now centralizes that lifecycle. It does not
  intercept inside clicks or change the existing logout handler, and returns
  keyboard focus after Escape while preserving normal Tab navigation.
- Both gameplay documents placed a music-credit link permanently in their
  footers. `moderation.js` separately appended a full-width report disclosure to
  `body`. Each document now has one compact, initially closed native
  **Yardım / Bildir** disclosure with attribution, contact and the existing
  reporting/blocking controls inside it. Opening it sends no request.
- Support remains in normal document flow, outside `.shell`, because existing
  auction-mode CSS hides `.shell > footer`. Nothing is positioned over the arena
  or added to its HUD. Closing support also collapses its nested report section;
  typing, confirmation and account-isolation protections remain unchanged.
- CrazyGames keeps its existing moderation exclusion; **Help / Info** and the
  credits link remain accessible. Static native details and links still work if
  the enhancement script cannot load. The full credit page and audio assets are
  byte-identical to the baseline.

## Attribution decision

The manifest/provenance record includes CC0, CC BY 3.0, CC BY 4.0 and Pixabay
Content License tracks. The complete title/creator/source/license/change notices
remain available on `/music-credits.html`, including `/crazygames/` routing. The
CC BY deeds checked on 28 October 2026 require appropriate attribution and allow
reasonable presentation; this change moves the link into a clearly named help
section rather than removing or suppressing the credits:

- https://creativecommons.org/licenses/by/3.0/
- https://creativecommons.org/licenses/by/4.0/

No new asset acquisition or reinterpretation of other asset permissions is part
of this UI change. Existing provenance and license evidence are retained.

## Verification

- Repository aggregate: **2,468 passed, zero failed/skipped**, pinned Node
  **26.12.1**. Also 2,467 passed on Node24 before the final additional regression.
- Focused mouse/touch/pen, Escape, focus/Tab, repeated toggles, navigation,
  background, identity guards, inside logout action and listener cleanup tests.
- HTTP: root and CrazyGames support/account assets and complete credits return
  200; web reporting stays mounted under support; portal moderation exclusion
  remains intact. Report/block backend regression uses disposable local guests.
- Existing login/invite/home navigation regressions continue to pass.
- Strict card audit: 50/50, no issues; commander parity candidate report: 50
  ready, zero blocked; existing balance simulation smoke passes.
- Independent review found no blocking issues and passed 91 focused checks.
- `git diff --check` clean.

### Explicit limits

Actual browser/phone UI verification is **not** claimed. Local Chromium launch
was blocked by sandbox socket permissions; the approved escalation failed before
launch because the executor's sandbox mount setup could not create its runtime
path. The cloud browser could not connect to the local preview server. No workaround
changed those restrictions. Node DOM models and HTTP tests are not substitutes
for a visual/touch test in the deployed browser. No production state was changed.
