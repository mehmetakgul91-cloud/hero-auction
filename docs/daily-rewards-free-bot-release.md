# Daily rewards and free bot entry

This is a gated release plan, not permission to change production.

## Approved product behavior

Google members claim one reward per server reward date. Europe/Istanbul day rollover is 02:00. Rewards remain 100/150/200/250/300/400 gold on days 1–6 and 5 diamonds on day 7; missed days reset the series and day 7 cycles to day 1. A daily overlay shows the current reward before claiming and never automatically shows a server-confirmed claimed day again. Guests are excluded. No automatic credit or historical backfill occurs.

New bot admissions are bot-free-v2 and require zero gold. All difficulty win rewards stay unchanged (100; 125 + 2 dust; 175 + 5 dust). User explicitly chose to retain unrestricted win rewards despite free entry. PvP entry stays 50 gold. New v2 draw/server-failure refunds are 0 because nothing was charged; legacy bot-fixed-v1 records still refund the originally paid 50 gold where applicable. Durable entryPaid means admitted, not necessarily a positive charge; entryGold is the actual price.

## Before publishing

1. Pass full Node 26 suite and isolated PostgreSQL jobs, including 010 DDL rollback/preservation, legacy paid settlement, zero-balance admissions, concurrent claims and retry/unknown-COMMIT tests. Do not substitute mocked unit results for PostgreSQL evidence.
2. Inspect current production service/database identity, backup availability and migration 009 constraint names. Read only the specific rollout flags. Do not dump environment secrets.
3. Obtain explicit approval for publishing reviewed source, applying 010 to the verified production database, and enabling only HERO_LOGIN_REWARDS_ENABLED=1 (HERO_DIAMONDS_ENABLED is already required). Purchases, exchange, welcome bonus and ads remain unchanged/off.

## Controlled rollout

Pause new admissions with the existing maintenance control, then wait for in-flight admissions and settlements to become known. Prefer drain of active bot battles before restart; do not cancel/refund arbitrary matches. Take/verify the provider backup reference using the existing authorized process. This additive versioned migration never rewrites old balances, receipts, profiles or room states.

Apply migrations/010-bot-free-entry.sql exactly once after inspecting the exact prior constraint catalog. It is transactional with a 5-second lock timeout. If it times out it rolls back; if COMMIT outcome is unknown, inspect named constraints read-only before any retry. Do not blindly rerun ALTER. Verify all three new constraints validated and old paid rows unchanged. There is no startup/pre-deploy migration.

Deploy the tested v2 server with daily flag still off. It fails bot availability closed if 010 constraints are absent. Both old v1 settlements and new v2 settlements are supported. Verify live commit/assets, free bot API capability entryGold 0, no failed pending settlement, and daily status eligibility. Enable only the daily login flag after the 02:00 code is live. Verify claim availability read-only, do not fabricate live grants/test users. Resume admissions only when runtime health is established.

## Rollback limits

Do not restore the v1-only binary after any v2 receipt exists: that binary cannot recover v2 matches. Keep the backward-compatible v2 reader/settler and disable new admissions if a fault occurs, then forward-fix. The SQL rollback test proves pre-COMMIT DDL rollback, not permission to erase committed v2 records. Never delete receipts or restore a whole database to undo this feature because it would discard legitimate intervening activity.

Phone/browser visual acceptance remains separate from code/ledger tests.
