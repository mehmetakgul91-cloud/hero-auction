# One-time new-member diamond gift — disabled foundation

The approved exception to paid-only diamonds is **10 diamonds once for each genuinely new verified Google member**. Subsequent diamonds require purchase; advertisements, matches, bot training, refresh and repeat login never award diamonds. Anonymous guests, CrazyGames accounts and all other login providers receive no registration gift, even if those other identities are verified.

`createDiamondSignupPolicy` requires both `HERO_DIAMONDS_ENABLED=1` and `HERO_DIAMOND_SIGNUP_BONUS_ENABLED=1`. Both default OFF. With the bonus disabled, `registerDiamondMember` returns without accessing any database table. Existing zero-default diamond wallets remain zero by default; only the distinct, audited registration transaction supplies this fixed exception.

## Server integration

After successful Google identity verification, call `registerDiamondMember({database, accountId:user.sub, provider:'google', policy})` **before** `rememberDisplayName` or any first-account/wallet insert. The server chooses the literal `provider:'google'`; never read it or eligibility from the browser. Any other provider, guest identity or CrazyGames namespace is rejected before storage. Do not call this hook from CrazyGames authentication, `/auth/check`, anonymous guest creation, games, ads, or a gift-claim HTTP endpoint. This foundation does not create or alter external provider settings.

The result includes `{enabled, eligible, awarded:0|10, replayed, diamonds, reason}` when enabled. Disabled calls return `{enabled:false, eligible:false, awarded:0, replayed:false, reason:'disabled'}`. This is an internal hook, not a public claim API. A client amount, receipt, request ID or `verified` flag cannot control the grant.

## Eligibility and persistence

The transaction takes an account advisory lock, reads registration/receipt/diamond schema before any writes, and conservatively checks existing gold wallets, user profiles, commander profiles and administrative account records. Any existing record makes the account ineligible. Therefore enabling later does not give old accounts a retrospective bonus. The transaction must then win both a unique profile-marker insert and the first gold-wallet insert; a legacy authentication upsert racing our initial lookup is ineligible, never overwritten. The temporary profile display name `Oyuncu` is replaced by the authenticated route's ordinary `rememberDisplayName` update.

For a genuinely new account, the transaction initializes the existing normal 500-gold wallet, inserts a zero-diamond wallet, adds exactly 10 diamonds, and writes a unique registration plus fixed `signup_bonus` receipt/ledger. All writes commit together or roll back together. The account-primary-key receipt and account-level serialization prevent duplicate gifts across parallel first logins, retries or lost COMMIT responses. Replays return the current diamond balance without another credit; spending a gift never restores it. An incomplete/inconsistent receipt fails closed rather than repairing itself by granting currency.

`migrations/003-diamond-signup-bonus.sql` is draft and unapplied. It performs no account backfill, mass grant, profile rewrite or production operation. It needs explicit migration/activation approval and real isolated PostgreSQL verification before release. Tests use an isolated transactional model; that is not a substitute for live migration/concurrency testing.

Account linking is not newly implemented. Eligibility is per Google account identity, not a claim that the server can recognize the same person across different verified Google accounts. Any future anti-abuse/account-linking policy must preserve one-time receipt history and be reviewed separately.
