# Selected commander role bonuses

Only the selected commander's branch contributes hero-stat bonuses. Other branch levels are retained unchanged and activate when their commander is selected. Upgrade prices and purchase caps (40 selected / 20 other) are unchanged. Each selected level gives 0.5%, up to 20%. Level zero adds nothing.

- Attack commander: fighter and assassin current attack × (1 + bonus).
- Magic commander: energy hero current attack × (1 + bonus), affecting ordinary, special and derived splash damage.
- Defense commander: tank current defense × (1 + bonus).
- Support commander: add the bonus as percentage points to support healing rate, not attack, HP or shield. A 40% heal plus 15 points becomes 55%. Hybrid healer/shield heroes retain the same shield rule.

The stat modifier keeps fractions to six decimal places: 50 × 1.15 = 57.5. Existing subsequent start passives/assassin bonuses retain their own rounding rules. Damage and healing retain their final integer rounding and healing cannot exceed missing HP. Hero automatic healing still occurs on rounds 3, 6, 9, 12 and 15 when the healer acts; regeneration passives are unchanged. The pending normal-budget revision is described in `../commander-normal/README.md`; it is not approved for release while energy and the new mage behavior are unresolved.

The preview uses live team preparation and shows each healer's rate plus its potential single-heal amount before the missing-HP limit. Both the combined preparation screen and legacy comparison show healing power. The center slot explanation reflects the integrated permanent +15% defense rule, not former targeting immunity.

## Verification

- Before center integration: 3,427 tests passed, zero failures.
- Final integrated center and commander changes: 3,436 tests passed, zero failures or skips, including final TR/EN healing DOM checks.
- Shared legacy/live engine parity: 5,600 cases passed, 284,975 damage checks, zero mismatches. All 50 heroes, both lanes, actual/equal power, seven contexts, two seeded critical streams, both seats. See `parity.json`.
- Strict roster audit passed. Dedicated examples check fractions, normal/special/splash damage, additive healing, hybrid shields, overhealing, off-branch inactivity and retained levels.
- Local Chromium visual harness was attempted with the available executable and approved escalation; the runtime refused Chromium's local socket (`Operation not permitted`). No screenshots or visual QA pass are claimed. Functional TR/EN DOM tests exercise rate and amount changes; the browser harness includes the same cases for a usable browser environment.

## Controlled balance experiment

Run `node tools/compare-commander-specialty.mjs`. The 10,368 simulations compare prior commander rules, revised rules and no commander bonus, with identical current non-commander mechanics including center defense. Six fixed role compositions play each other at equal power 80, levels 0/10/30/40, four commanders, three seeds and both seats. The opponent has no upgrades. No manual commander abilities are cast. This is not a population win-rate estimate or proof of global balance.

At level 30 (+15%), in 36 mirrored cases per composition/commander:

- Mixed composition: no bonus wins 8; attack wins 15; magic 19; defense 10; support 9.
- Two-healer composition: no bonus wins 26; support wins 27. Total healing increases from 10,703 to 12,921.
- Three-healer composition: no bonus wins 18; support wins 27. Total healing increases from 15,854 to 19,745.

The healing bonus can be strong in healer-heavy teams, so its three-round frequency alone does not justify multiplying it by three. Missing health, early deaths, target selection, damage prevention and match duration affect realized value. Likewise, +15% defense is not 15% damage reduction: defense 50→57.5 reduces raw damage by about 4.76% before rounding. Further balance changes require separate approval and should include varied powers, actual auction outcomes and timed commander casts.
