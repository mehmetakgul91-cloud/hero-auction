# Earned victory chests and magic dust — 26 October 2026

## Approved rules

- A completed, server-decided **real-player paid-entry win** earns one chest **instead of** the old 120-gold victory award, never in addition to it.
- Gold is guaranteed: **100 / 105 / 110 / 115 / 120**, initially **20% each**.
- A separate **40%** roll earns **3 / 4 / 5 magic dust**, equally likely conditional on a dust drop.
- A separate **10%** roll earns **1 diamond**. All three currencies can appear together; these are not mutually exclusive rarities.
- Entry remains **50 gold per player**. Draws refund **50 each**. Computer training has no entry fee, chest, currency reward or rating change.
- Commander upgrade **15→16** adds **5 dust**. Later costs are `ceil(5 × (6/5)^(currentLevel−15))`, calculated from the original base with exact integer arithmetic: 5, 6, 8, 9, 11, 13… . Existing gold costs and the separately enabled **20→21 +10 diamonds** rule remain.
- Existing levels and balances are never reset, backcharged or retroactively rewarded. Historical upgrade receipts replay with dust cost0.

Default average chest: 110 gold,1.6 dust,0.1 diamonds. Thus a winner's immediate net gold after entry is50–70 (average60), not the old70. This does not include optional future diamond conversion, which remains separately OFF.

## Configuration and rollout

All new economic switches default OFF:

| Switch | Effect | Dependency |
| --- | --- | --- |
| `HERO_DIAMONDS_ENABLED=1` | Existing diamond wallet and21+ upgrade requirements | Migration001 |
| `HERO_MAGIC_DUST_ENABLED=1` | Dust wallet and16+ upgrade requirements | Diamonds enabled + migration005 |
| `HERO_VICTORY_CHESTS_ENABLED=1` | Replace real-player win120gold with chest | Both currency switches + verified schema005 |

**Do not inadvertently enable** `HERO_DIAMOND_SIGNUP_BONUS_ENABLED`, `HERO_DIAMOND_EXCHANGE_ENABLED` or `HERO_LOGIN_REWARDS_ENABLED`. They are independent existing features, not necessary for this release. Advertising and purchases remain unavailable; this release adds no purchase, chest sale, trading, reverse exchange or cash-out endpoint.

Rarity is a server-side versioned configuration in `victory-chests.js`: gold weights, dust chance and diamond chance. Chances use basis points and reject malformed values. Initial approved chances are100%/40%/10%; configuration changes require a reviewed version change. `/api/info` exposes the current configured chances; old receipts retain their original version and quantities. No administrative adjustment UI is introduced.

The header always shows gold/dust/diamond; unavailable or disabled values use **—**, not invented0. Enabling a chest switch with missing dependencies/storage blocks paid entry **before charging**, while free bot training remains available. Disabled code preserves old settlement and does not query the new schema.

## Server authority, transactions and recovery

1. Only `settleFinishedMatch` after the authoritative final result can request an earned chest. There is no public claim/open/grant API.
2. `persistVictoryChestIntent` validates a completed, paid, non-bot winner; acquires a match advisory transaction lock; rejects legacy awarded matches; draws from `node:crypto.randomInt` independently of combat RNG; saves one immutable-by-application intent keyed by `code:matchNumber:created`.
3. The intent transaction commits **before** credit. A credit failure retains the same quantities/configuration. No uncommitted quantity reaches the browser.
4. `creditVictoryChest` locks the same match, then gold→diamond→dust wallet rows (compatible with existing upgrade/exchange/daily lock order). The three wallet credits, positive-currency receipt/ledger and legacy-gold award-id reservation commit atomically. Overflow rolls everything back; a lostCOMMIT response is resolved by the same durable key.
5. The old negative-only diamond upgrade ledger is not weakened. Chest receipts are the separate positive three-currency ledger. Dust upgrade debits have their own FK-linked ledger and live in the existing upgrade transaction.
6. Until credit is confirmed, rematch/new-seat progression waits. On restart, pending intents and relevant current-code receipts repair unfinished/older room snapshots without overwriting a newer match. A pending room saved before its intent committed is also requeued. Old pending matches still credit their winner without replacing a newer room.
7. Only the winning seat receives its committed receipt. The automatic opening and sequential earned-item animation are presentation only. Account/portal/match-scoped session IDs suppress repeated celebration; refresh/reconnect never roll or credit. Reduced-motion and blocked UI storage show the receipt immediately. Pending requests have timeout/backoff, navigation/auth guards and teardown.

The existing room engine remains single-process. These tests do not prove physical cluster failover or restore an authoritative battle outcome that never reached any durable record. Avoid overlapping old/new servers during economic cutover: drain paid matches and pending awards first, then follow the reviewed release runbook.

## Migration and verification

`migrations/005-victory-chests-magic-dust.sql` is additive and **not auto-applied**. It follows001–004, adds dust storage, a default0 historical receipt column, dust debit ledger, durable chest intents and a constrained positive receipt ledger. It performs no account/profile/balance data update.

- Unit/HTTP/DOM/VM coverage: threshold rounding; independent exact odds; forged requests; winner privacy; flags OFF; missing schema; no charge on failed entry; replay/lostCOMMIT; all three rollback; legacy double-award protection; integer bounds; interrupted UI; rematch and restart recovery.
- `tools/test-postgres-victory-chests.mjs`: separate empty disposable PostgreSQL18 only, exact loopback URL and DB/user/version/empty-schema guards. Real constraints, triggers, transactions, concurrent duplicates and cross-operation conservation. Never accepts `DATABASE_URL` or ambient production credentials.
- `.github/workflows/economy-postgres-tests.yml` includes the existing12-group foundation job and a separate13-group victory/dust job using the pinned official PostgreSQL18 image.
- Browser pixel QA is not claimed: Chromium was blocked by sandbox socket permissions; the supported escalated runtime also failed before launch. Do not bypass filesystem restrictions. Offline preview fixtures are review aids, not actual rendering evidence.

Before production activation, verify isolated CI, live schema/privileges, recoverable backup evidence, migration manifest and balance/profile preservation. The current game uses gold entry stakes and introduces randomly earned diamonds; any future purchase/provider activation requires a separate product/platform/compliance review. This document makes no jurisdiction-specific legal conclusion.
