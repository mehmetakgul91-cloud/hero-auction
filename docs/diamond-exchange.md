# Diamond → gold foundation (disabled)

This foundation only spends diamonds already held by an authenticated account
and credits gold. It cannot create diamonds, convert gold to diamonds, purchase
anything, accept a payment claim, or cash out. It is not a payment integration.

## Approval and defaults

- Both `HERO_DIAMONDS_ENABLED=1` and `HERO_DIAMOND_EXCHANGE_ENABLED=1` are required.
  Missing flags leave the feature off. Do not enable either in production yet.
- The user-approved rate is **1 diamond → 500 gold** (10 diamonds → 5,000 gold).
  `createDiamondExchangePolicy(env, config)` defaults to this approved rate but
  remains disabled. Passing `null` explicitly leaves pricing unconfigured.
  Server configuration has shape `{rate, version}`;
  `rate` is positive integer gold per diamond and `version` is a stable identifier.
- `migrations/002-diamond-exchange.sql` is a reviewable draft, not automatically
  executed. It depends on the separate draft diamond wallet migration. Existing
  balances/profiles are neither migrated, reset nor retrospectively charged.

## Server integration contract

`diamondExchangeView(policy)` gives the authoritative availability/rate/version.
Never make up a rate in the client. An unavailable or missing rate must disable
conversion, not make the exchange free.

The authenticated/banned-account-checking caller invokes:

```js
exchangeDiamondsForGold({
  database, accountId: authenticatedUser.sub, policy,
  request: {requestId, diamondsToSpend, expectedRate, pricingVersion}
});
```

`diamondsToSpend` is a positive integer requested debit. `expectedRate` and
`pricingVersion` express the player's accepted quote, not the source of pricing.
The server compares them with configuration and computes gold itself. Ignore
client account IDs, balances, payment claims and credit amounts.

On success the response contains current `gold`, `diamonds`, `diamondsSpent`,
`goldGranted`, `requestId`, `replayed` and `exchange` availability metadata. Retain
the same request ID while an operation is transport-uncertain. Reusing the ID
with another amount/rate/version conflicts. Retrying a committed request returns
fresh locked balances and never applies the conversion again.

## Atomicity and audit

The service locks the gold wallet, then the diamond wallet. This is consistent
with commander upgrades' commander → gold → diamond lock order and therefore
does not introduce a reverse-lock cycle. All checks, the diamond debit, gold
credit and durable receipt occur in one transaction. A missing diamond wallet
means zero diamonds; it is not created or funded by an exchange.

The dedicated `hero_auction_diamond_exchanges` table is both an idempotency store
and an immutable-by-application movement ledger. It records the debit, credit,
both before/after balances and the configuration version. Audit diamonds using
both the commander-upgrade ledger and this exchange ledger. No receipt is
deleted by this implementation. Wallets and arithmetic are bounded to PostgreSQL
`INTEGER`; exact `BigInt` multiplication checks overflow before either balance
changes. Failure rolls both changes back; lost commit acknowledgement is resolved
only by a retry with the original key.

## Still required before activation

Explicit activation approval, isolated PostgreSQL migration and
concurrency verification, payment-provider/package decisions and refund policy
remain separate work. A future verified-payment adapter must trace purchases,
upgrade debits and conversion debits together. Refunds of already-spent diamonds
must not silently create negative balances or mint replacement currency. Define
and review a hold/reconciliation policy before implementing any refund/reversal
path; none exists here. No production database is touched by these files/tests.
