# Paid diamonds — disabled local foundation

## Approved progression

- Gold: target level `L` costs `ceil(200 × (6/5)^(L−1))`. First steps: 200, 240, 288, 346, 415. Level 19→20 costs 6,390; 20→21 costs 7,668; 39→40 costs 244,962.
- When diamonds are enabled, target levels 21–40 additionally cost `ceil(10 × (6/5)^(L−21))`: 10, 12, 15, 18, 21, 25, 30, 36, 43, 52, 62, 75, 90, 107, 129, 155, 185, 222, 267, 320.
- Each price is rounded upward once from the original base using exact integer arithmetic, not from the previously rounded price.
- Main branch cap 40, other branch caps 20, battle stats and saved levels remain unchanged. Previously attained levels 21–40 are grandfathered: no reset, debt or retroactive debit. Switching commanders preserves all stored levels under the existing rules.

## Activation boundary

`HERO_DIAMONDS_ENABLED` is OFF unless exactly `1`. While OFF, upgrades require gold only (using the newly approved gold curve). No diamond table is queried or changed. Diamond balances are returned as `null`, not a fabricated zero balance. No payment, checkout, mint, credit, admin diamond grant or purchase endpoint is included. `purchaseAvailable` is always false. Ads, matches and bot training never create diamonds. The sole free-credit exception is a separately gated, one-time 10-diamond gift for genuinely new Google members; repeated login, guest and CrazyGames sessions do not qualify. See [signup-bonus design](diamond-signup-bonus.md).

`migrations/001-paid-diamonds-foundation.sql` is a **draft, unapplied** transaction. Server startup does not execute it. It adds a separate integer, nonnegative, zero-default diamond wallet, durable upgrade receipts and debit-only upgrade ledger. Migration 002 separately records one-way 1 diamond → 500 gold exchange; migration 003 separately records the fixed Google signup-bonus exception. No migration rewrites existing gold wallets or commander profiles, and no existing member is retroactively gifted. Missing schema or invalid/missing price configuration fails closed; it never silently uses gold-only pricing while the diamond flag is ON.

Before enabling: choose and approve the payment provider, paid packages and prices; implement and independently review the provider-specific verification/refund integration; test explicit migrations and concurrency on an isolated real PostgreSQL database; obtain deployment/migration/activation authorization. This patch does none of those external actions. Tests currently model SQL locking/rollback in isolation and are not live PostgreSQL evidence.

## Account source and transactional contract

Accounts remain identified by authenticated `readLogin(...).sub`; profile/levels remain in `hero_auction_commanders.profile`; gold remains in `hero_auction_wallets.gold`. There is no new independent account identity and no client-supplied balance or price is used.

Enabled upgrades require `{stat, commanderId, expectedCurrentLevel, requestId}`. Use a random request ID of 16–100 ASCII letters/digits/underscore/hyphen; keep it unchanged when retrying an uncertain request. The transaction locks the commander, gold wallet, then diamond wallet. It validates the current profile/caps/prices and both balances, debits both, writes the receipt/debit ledger and updated level, then commits. Any failure rolls everything back. Another key with the same expected level cannot buy an unintended second level. Same-key payload changes are rejected. A retry after a lost COMMIT response reads the durable receipt and returns the current locked profile/balances without another debit, including if later upgrades have occurred.

When the flag is OFF, legacy callers remain compatible. New UI requests still send commander and expected level; these are checked under the existing profile row lock to prevent accidental duplicate upgrades. The server never trusts client `gold`, `diamonds`, `cost`, `diamondCost`, `profile` or `accountId` claims.

### UI response

Commander get/select/change/upgrade responses include `diamonds` (integer when enabled, `null` when disabled) and:

```js
progression: {
  diamondsEnabled, purchaseAvailable: false,
  purchaseReason: 'provider_not_configured', requestIdRequired,
  welcomeBonus: {enabled, amount: 10, eligibleProviders: ['google']},
  branches: { attack: {currentLevel, nextLevel, cap, gold, diamonds,
    requiresDiamonds, canUpgrade, reason}, /* defense/magic/support */ }
}
```

`reason` is null, `maximum_level`, `pricing_unavailable`, `insufficient_gold` or `insufficient_diamonds`. At a cap, `nextLevel` is null and costs are zero. When paid pricing is absent, `diamonds` is null and `canUpgrade` false. `welcomeBonus.enabled` requires both main and signup-bonus flags and describes policy, not current-account eligibility or a successful award. Quotes are server snapshots, not reservations; the upgrade validates again under lock. A diamond preflight read occurs before selection/change mutation so a missing diamond schema cannot produce an error after a committed gold-only change.

## Future receipt adapter design — not implemented

Do not accept a browser `paid:true`, `verified:true`, amount, price, SKU or transaction ID as proof of payment. A selected provider adapter must verify authenticated server callbacks/receipts using the provider's official verification flow and environment, bind the verified order to the intended authenticated account and server-owned SKU/package, verify settled payment amount/currency and replay/restore semantics, and deduplicate globally on the provider transaction identity. A separate reviewed migration is required before purchase-credit ledger entries are possible; the fixed signup-bonus ledger is not a purchase/mint adapter. Upgrade receipts and balance changes must remain atomic.

Refunds/reversals, duplicate deliveries, delayed notifications, account-link/restore behavior, provider retries and support reconciliation need an explicit policy before sale. In particular, already-spent refunded diamonds require a reviewed resolution policy that does not create a negative wallet or silently rewrite historical levels. No provider keys, accounts, agreements, tax/store settings or real transactions are created by this foundation.
