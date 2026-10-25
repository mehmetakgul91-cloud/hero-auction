# Hunt Order until first target death — local verification

Date: 2026-10-25. Local implementation only; not pushed, released, or deployed.
Base: merged invitation PR #43, canonical commit `c647df1335b0cc3a0cf1f6ef5c02f680217dbfc1`; local equivalent `8246767de65bcfdc8eab4757fe592cbf60bda349`. Both have tree `5ff312676ba820a46ea274a29295210b4f8232bf`.

## Behavior

New Av Emri / Hunt Order casts place a server-owned, JSON-safe `commanderFocusUntilDeath: true` mark on the explicitly selected living enemy. All allied hero attacks prioritize that enemy until its first actual death. The mark is not tied to a round or per-hero attack allowance, so repeated attacks and revived allies participate. Hero healing/shield actions remain unchanged; secondary area targets are not redirected.

The shared atomic damage helper clears the mark at actual death, including execute, headshot, commander damage and secondary area damage. Last Bastion survival at 1 HP is not death. Revival never restores a removed mark. Elimination, round-limit completion and rematch reset clear focus. Server snapshots, partial transcript recomputation, bot decisions and replay state use the same semantics. The client clears omitted status fields rather than retaining stale values after death/revival/reconnect.

Existing historical per-hero timed tokens and unflagged historical cast events keep their old semantics; they are not silently upgraded. New cast events identify the until-death effect explicitly. The ultimate still costs 75 from its own charge, remains once per battle, and requires manual enemy selection. No extra attacks, damage, cost, power, economy, invitation, deployment configuration, or purchase behavior was added.

## Verification

- `node --test *.test.js tests/*.test.* test/*.test.js`: **1,495 passed, 0 failed, 0 skipped**.
- `node --test tests/hunt-until-death.test.mjs`: **32 passed**. Includes six real action rounds/all five allies, repeated attacks, all damage families, guard/execute/AoE death, revival, authoritative targeting and payload injection, stale snapshot rejection, final round, new-match preparation, legacy tokens, bot/replay/transcript state and shipped client handlers.
- UI-focused check: **119 passed** (TR/EN copy, profile, training, replay, effect labels, readiness).
- Independent review: **102 focused tests passed**, no remaining correctness/security blockers. The review identified and verified fixes for stale client/replay status retention.
- `npm run audit:strict`: 50 active cards, all images/abilities/reviewed powers present, no problems.
- `node scripts/report-commander-parity.mjs`: 50 candidate-ready mechanics, 0 blocked. This static readiness report is not a new balance study.
- Syntax checks for changed JavaScript and `git diff --check`: clean.

No fresh large balance simulation was run. Comparison tools were only updated to recognize the new state representation. No visual browser/device QA was performed; shipped-handler/DOM tests are functional checks, not screenshots.
