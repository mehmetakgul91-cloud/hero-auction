# Store + repeating login rewards — disabled foundation

Current baseline: `65f84dc5dc91009bfcf1d5758485684ee17cf4bb` (PR46).
The unpublished `92ea495` store/reward patch was restored from its verified
Library manifest and applied without conflicts; the assassin formation changes
remain intact.
This release publishes implementation/UI only. It does not apply production
migrations, enable flags, build Android, create provider accounts/credentials,
sell currency, play rewarded ads or grant live rewards. A catalog-only production
schema probe was blocked by the database network allowlist; no user rows were read.

## Approved schedule (latest user correction)

| Consecutive claim day | Gold | Diamonds |
| --- | ---: | ---: |
| 1 | 100 | 0 |
| 2 | 150 | 0 |
| 3 | 200 | 0 |
| 4 | 250 | 0 |
| 5 | 300 | 0 |
| 6 | 400 | 0 |
| 7 | 0 | **5** |

The initial proposed day-7 amount was 10; the user's later instruction changed
it to **5**. This does not change the separate once-only **10 diamond Google
welcome gift**, upgrade prices, 1 diamond → 500 gold conversion, or battle rules.
An eligible new Google member may receive both the welcome gift (if separately
enabled and genuinely new) and campaign day-1 gold. Existing Google members are
eligible for this campaign; they are still ineligible for the welcome gift.

Days are calendar dates in **Europe/Istanbul**, not elapsed 24-hour periods.
After claimed day 7, claiming on the immediately following date awards day 1.
At least one skipped date resets the next claim to day 1. Repeat indefinitely.
One claim per account/date across tabs, sessions, processes and restarts.
A previously claimed date returns its receipt, not another reward.

### Login versus claim

This version uses a deliberate **Ödülü al** action in the store. A current
verified Google session is sufficient: daily logout/login is not required.
Opening the store, checking a session, refreshing the page, or a GET request does
not advance the streak. The UI must say that the reward is **claimed**, rather
than imply that simply logging in saved that date. A missed/unclaimed date has
the approved reset behavior. This avoids GET/background reads silently minting
currency and makes the successful receipt the clear progress boundary.

## Capability and activation boundary

`HERO_LOGIN_REWARDS_ENABLED=1` **and** `HERO_DIAMONDS_ENABLED=1` are both necessary.
Both are OFF by default. There is no gold-only partial campaign with day 7
unavailable. Schema readiness and a trusted Google account are also required.
Missing schema fails closed; migration 004 is not executed by server startup.
The Google welcome gift and exchange keep their separate existing flags.

The new store uses actual server capabilities:

- **Elmas Al**: unavailable; no SKU, invented TL price, checkout or payment URL.
- **Reklam İzle / Altın Kazan**: unavailable until a verified provider exists.
  Existing source amount **100 gold**, max **5 per UTC day**, remains unchanged;
  `/api/rewarded/claim` still returns 503. This is not activation/approval of a new
  ad program. The campaign's Istanbul day does not change the ad draft's UTC day.
- **Elmas → Altın**: existing separately gated 1 → 500 exchange, exact quote and
  one confirmation, durable per-account request ID for uncertain retries.
- **7 Günlük Giriş**: schedule visible but clearly disabled until ready. No
  reward button success or balance claim without the authenticated receipt.

CrazyGames Basic Launch keeps the store hidden; guests/CrazyGames are never
eligible for the login campaign. No Apple identity integration or eligibility
has been added. The latest user instruction replaces the **Ligler** tile with one **Mağaza**
tile and restores **İletişim**. The league page/backend/data are retained; only
the main navigation entry is removed. The six-item web grid and commander layout
are retained, with normal in-place store Close/Home behavior.

## Authentication and privacy

Only `readLogin` (HMAC signature and expiry checked) supplies the account and
provider to the service. Current Google verification stamps `provider: google`
inside the signed session after issuer/audience/expiry/subject/email verification.
CrazyGames and guest routes sign their explicit providers. Body values such as
`accountId`, `provider`, `email`, `verified`, `day`, `gold`, `diamonds` and client
clock are not passed into reward computation.

Older still-valid signed Google sessions did not include a provider. The server
normalizes only that legacy signed shape: nonempty verified email, unprefixed
subject, no existing provider. Neither guest nor CrazyGames ever had that shape;
the compatibility bridge does not extend expiry. The reward module itself
requires explicit Google provenance and excludes reserved subjects.

A receipt response contains only the authenticated account's date, reward day
and amounts, plus current locked balances. It never returns account IDs, email,
session tokens, provider secrets or other users' receipts.

## Transaction / recovery protocol

`POST /api/store/status` is read-only, including its one-statement streak/receipt
snapshot. It supplies the canonical `serverDay`. `POST /api/login-rewards/claim`
accepts only `{authToken, rewardDate}`. This date is a receipt key, **not** trusted
proof of today's date.

1. Authenticate + suspension check; reject disabled/non-Google/unready requests.
2. Begin; lock the existing member profile row (`FOR UPDATE`). No missing profile
   is synthesized by a claim.
3. Read `clock_timestamp()` from PostgreSQL **after** that lock, converted with
   `AT TIME ZONE 'Europe/Istanbul'`. `NOW()` is intentionally not used because a
   transaction that waited at midnight retains its transaction-start timestamp.
4. Read the requested receipt and latest durable receipt/streak. Check schedule,
   provider, date and day-index consistency. Orphan or stale state fails closed.
   A clock earlier than the recorded date grants nothing and reports unavailable.
5. Without a receipt, `rewardDate` must be today; old/future dates are rejected.
   An old existing receipt can be recovered without awarding today's reward.
6. Lock gold, then diamonds. Check integer limits. Credit the fixed scheduled
   currency, insert the unique account/date balance ledger, and update streak
   together. On day 7 only diamonds +5; no unspecified extra gold.
7. Commit. A lost commit response is unknown, not failed: retry **the same date**.
   Return the durable receipt with current locked balances. The client preserves
   the pending date and prevents accidental next-day/new-operation fallback.
   Commander and store share account-scoped persisted exchange requests and an
   in-flight lock; changing screens cannot create a second request or leave the
   active screen stuck. Expired/banned-session responses (401/403) retain the
   unknown operation for recovery after reauthentication, not a new request.
   Unreadable/corrupt browser journals fail closed without replacing the stored
   operation; storage cannot be treated as empty merely because reading failed.

Global compatible order: rewards **profile → gold → diamond**; upgrades
**commander → gold → diamond**; exchange **gold → diamond**. Rewards never acquire
commander after a wallet. Existing signup's advisory/profile/gold/diamond
registration remains separate and completes before ordinary login.

Migration 004 uses a nonnegative two-currency receipt ledger with the exact
seven-day schedule enforced by CHECK constraints, account/date primary key,
balance equations, and a streak foreign key including date/day-index. There is
no generic positive-diamond mint API and no client-selectable reward amount.

## Required before activation

1. Confirm the explicit-claim behavior and rollout scope. Code/UI publication is
   approved; this does not by itself enable currency operations.
2. Independently review the final wallet/auth/receipt changes.
3. Run the approved **isolated, non-production PostgreSQL 18** Actions service.
   Run migrations 001–004 and validate actual SQL
   types/constraints, concurrent connections, row locks, rollback, restart and
   lost-commit recovery; verify storage/backups and deployment prerequisites.
   This executor has no `psql`, `postgres`, `initdb`, `pg_ctl` or Docker. Local
   SQL-model tests do **not** replace the separate real PostgreSQL CI evidence.
4. Separately authorize the release, migration and precise feature flags. Main
   diamond activation also changes 21+ upgrade requirements, so review that
   effect together with campaign availability. Do not enable a partial campaign.
5. Select/approve provider, SKUs/prices, secure verification/refund/advertising
   adapters and test their policies before enabling sales or rewarded ads.
   Those integrations remain out of scope; no live provider is claimed.

## Local verification

Run the normal aggregate functional suite:
`node --test *.test.js tests/*.test.* test/*.test.js`, then `npm run audit:strict`.
Focused reward tests cover Istanbul midnight, gaps/cycles, exact seventh reward,
duplicate/replayed claims, uncertain commit, stage failures, authenticated
provenance, missing schema, overflow and cross-operation wallet serialization.
The offline preview uses the actual store controller and isolated sample data,
with `connect-src 'none'`; it cannot perform a real payment or account action.
DOM/HTTP checks are not a claim of actual mobile-pixel or real-device validation.
No new combat balance simulation is part of this work.

### Verification result — 25 October 2026

Original foundation: **1,593 / 1,593** aggregate functional tests passed;
strict audit: **50 / 50** active heroes, no problems. JS syntax and patch whitespace
checks passed. Independent wallet/auth/UI review found no remaining blocker after
shared pending-operation and both-direction navigation recovery fixes.

The actual-controller offline preview was regenerated and its embedded module
parsed successfully. No actual-browser mobile pixels were verified. The original
foundation verification did not include a real PostgreSQL run. These limits are
distinct from the passed functional and SQL-model tests above.

The latest-main aggregate including replacement Mağaza navigation and invitation
cleanup passed **1,617 / 1,617** functional tests. A separate guarded, disposable
PostgreSQL 18 CI job now checks actual migrations, constraints, concurrency,
rollback and receipt recovery. Its result is recorded on the exact release commit
in CI; merely adding that job is not a claim that it passed. No production schema
migration or economy-flag activation is part of this release.

## Current rollout gate (latest navigation request)

Main navigation is Oyna / Komutan / Kahramanlar / Arkadaşlar / Mağaza / İletişim.
The old Ligler page/data remain; no extra store page or league return flow exists.

The known Render database is PostgreSQL18. Its external IP allowlist is empty;
the managed read-only schema query cannot connect. No allowlist/security setting
was changed and no connection credentials were requested. Local PostgreSQL is
not installed; installation has not been authorized. An approved disposable
GitHub Actions PostgreSQL18 service is the isolated real-SQL verification path.
That CI database never contains production data or production credentials.
Passing isolated CI does not itself establish production schema readiness or
provide an authorized internal-network migration execution path. See the
activation checklist for exact preflight, migration and rollback requirements.
