# Mage normal ability: implemented local contract

The previously pending geometry and stun decisions are resolved and implemented locally. This file keeps its original path for existing links. No release, deployment, or completed visual browser verification is implied. Mage normal costs 60 energy; other commanders retain 40. Attack, defense and support selected-level bases and repeat use are unchanged. The separate support revival remains 55% maximum health.

## Frozen formation geometry

`public/commander-formation.js` captures immutable neighbor IDs from the complete prepared starting team. Each lane retains its original order and count. Death, revival and later mutable unit data never compact slots or recalculate neighbors.

- Same lane: only immediate indices, `abs(i - j) === 1`.
- Across lanes: normalized center distance is at most one spacing of the denser lane, `abs((i + .5)/n - (j + .5)/m) <= 1/max(n,m)`.
- The implementation avoids floating-point boundary errors using the equivalent integer condition `abs((2*i+1)*m - (2*j+1)*n) <= 2*min(n,m)`.
- Indices `i,j` are zero-based; `n,m` are the original lane counts. This includes adjacent diagonal positions and does not use a rectangular column grid or nearest-living-hero substitution.
- With 2 front + 3 back, the center rear target has both front slots and both immediate rear neighbors in its area.
- With 1 front + 4 back, the front target has only the middle two rear slots in its area.
- Only currently living occupants receive damage. A dead slot stays empty for targeting purposes; it does not transfer damage or make a more distant hero adjacent.

## Authoritative damage and action stun

Capture the prepared energy-role attack total once at battle start, after battle preparation. Later deaths, buffs or debuffs do not recalculate it.

- `mainDamage = Math.round(commanderLevel + .05 * startingEnergyAttack)`.
- `areaDamageEach = Math.round(mainDamage * .25)`; use the rounded raw main budget, not actual post-shield HP loss.
- Level 15 with starting energy attack 200 gives 25 main and 6 per living neighbor.
- Validate exactly one living enemy before spending resources. Resolve area recipients from the frozen formation before damage. Hit the main target first, then area targets in deterministic captured-team order. Main death never retargets the remaining area damage.
- Apply each raw budget through the shared hero-damage path: shield absorption, Last Stand, lethal cleanup and Arcane Surge transfer remain authoritative. Do not add another defense, critical or skill multiplier.
- Only the selected main target, if it survives its hit, gains `commanderStunNextAction`. Area recipients are not stunned.
- At its next scheduled action, consume this flag before healing, shield-only or attack branches. The entire action, including attack splash and action-linked effects, is skipped. Automatic passive effects remain unaffected.
- The pending flag survives round boundaries, does not stack and clears on death, revival or battle finish. It is one scheduled action, not an elapsed-round lock.

## Events, replay and historical compatibility

Emit one `commander-hit` per recipient with raw damage, actual HP loss, absorption, guard and transfer metadata. The `commander-magic-normal` summary reports damage impacts and surviving-main-target stun `{kind:'stun', value:1, nextAction:true}`. Replay applies damage events once, not summary damage a second time.

New skip events carry `stunScope:'action'`. Historical `nextAttack:true` impacts and `commanderStunNextAttack` remain attack-only: healing and shield-only actions do not consume them. A historical skip without a scope retains the legacy attack meaning. Old weakening logs are not converted to either stun. Live and replay badges, impact labels and event text distinguish new action skips from old attack skips in Turkish and English.

Shared legacy/live helpers preserve target validation, normal energy and cooldown rules, request-ID idempotency and all-or-nothing rejected casts. Client-supplied damage, neighbors, status duration or energy do not determine the result.

## Verification

- Geometry tests cover supported lane splits, mirror seats, exact center boundaries, same-lane edges and stable dead-slot adjacency.
- Damage and lifecycle tests cover the prepared attack snapshot, rounding, shield/Last Stand, main-first resolution, lethal main and area hits, surviving-primary-only stun, action consumption including heal/shield, passive independence and death/revival/finish cleanup.
- Presentation tests cover Turkish/English descriptions, frozen 5% rate metadata, costs, badges, committed effects, scope-aware replay, historical logs, duplicate summaries and live snapshot cleanup.
- Target controls retain rejection/retry, cancellation and repeated-click protections. Browser test fixtures expect 40 normal energy remaining after spending 60 from 100.
- Focused frontend checks passed locally. Real visual browser verification remains outstanding due to the environment limitations already recorded; DOM/VM checks are not a visual QA claim. Balance simulations are controlled comparisons, not evidence of real-player win rates or guaranteed balance.
