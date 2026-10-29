# Hero attack signatures — local candidate

Scope: web 2D hero combat on main `4052977`. Released portraits and commander ability effects are unchanged. No server combat math, target selection, HP updates, energy, initiative or native Android changes.

## Why the previous effects felt weak

Replay and live hero events already reached `animateMove`, but portrait-local overlays were clipped into small portraits. Impacts appeared before travelling orbs arrived; those orbs faded throughout flight. Most melee classes shared a slash; support damage used a generic orb; specials mainly added a banner/glow. CSS lunge/charge also competed with WAAPI actor motion.

## New presentation

Every normal attack gets visible cast → directional travel → arrival impact. Fighters use broad weapon crescents, bow-bearing roster IDs use shaft/head/fletching arrows, energy heroes use charged bolts and runes, tanks use a hammer silhouette and short ground-wave impact, assassins use thin shadow travel and silver crossing daggers, and support attacks use light. Healing and shields retain their committed friendly-action semantics.

Specials add role-specific geometry: arrow companions, orbiting magic fragments, a second fighter arc, tank debris and assassin ghost/finishing cuts. These are decorations, never additional hits. Existing lightning identities remain lightning.

Transparent fixed overlays escape portrait clipping; damage labels stay on their existing higher layer. Shared resource ownership bounds effects and cleans them on interruption, visibility/motion changes and rematch. Reduced motion hides the new layer. No looping or full-screen flash.

Live events sharing a committed version now present together, preserving complete multi-target casts. The 220 ms interval remains between casts; stale backlog eviction removes whole casts. Authoritative health snapshots are not delayed.

## Validation boundaries

Unit/VM tests verify real roster mappings, normal/special nodes, coordinate travel, arrival delays, cleanup, repeated casts, live multi-target grouping and actual animator integration. Full repository suite and strict card audit are run for this candidate. These checks are not visual proof.

Ordinary managed-browser navigation to the local app at port 3215 returned `ERR_CONNECTION_REFUSED`; no new-build screenshot or motion evaluation was obtained. Previously blocked DevTools and CLI Chromium routes were not retried. Preview deployment is not authorized, so the existing remote preview was not changed. Desktop/mobile visual acceptance remains a release gate.

Final automated result: `npm test` 2,515 passed, 0 failed; `npm run audit:strict` 50/50 portraits, abilities and reviewed powers, no problems; syntax checks and `git diff --check` passed. Local HTTP smoke test served HTML and both new assets with 200 responses. Runtime here is Node 24.22.1 (repository pins 26.12.1); no deployment/runtime claim is implied.
