-- DRAFT / NOT AUTO-APPLIED. Separate production approval and isolated SQL
-- verification required. Only the existing gold wallet table is a dependency;
-- diamond/dust grants also require their separately approved schema and flags.
-- No current account, balance, historical visit or previous ledger is changed.
BEGIN;
-- This immutable receipt IS the durable owner-action audit and positive ledger.
-- Request IDs are global, not account-scoped: a key cannot credit another user.
-- Do not time-expire financial receipts; deletion would break safe retries.
CREATE TABLE IF NOT EXISTS hero_auction_admin_wallet_credits (
 request_id VARCHAR(100) PRIMARY KEY CHECK(length(request_id) BETWEEN 16 AND 100 AND request_id !~ '[^a-zA-Z0-9_-]'),
 account_id TEXT NOT NULL REFERENCES hero_auction_wallets(account_id),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 200),
 currency TEXT NOT NULL CHECK(currency IN ('gold','diamonds','magicDust')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 1000000),
 reason VARCHAR(300) NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 300 AND reason=btrim(reason)),
 balance_before INTEGER NOT NULL CHECK(balance_before>=0),
 balance_after INTEGER NOT NULL CHECK(balance_after>=0 AND balance_after::bigint=balance_before::bigint+amount::bigint),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS hero_auction_admin_wallet_credits_created ON hero_auction_admin_wallet_credits(created_at DESC,request_id DESC);
COMMIT;
