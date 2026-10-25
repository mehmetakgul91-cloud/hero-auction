-- DRAFT / NOT AUTO-APPLIED. Requires explicit migration/activation approval and
-- 001-paid-diamonds-foundation.sql. No old account is backfilled or credited.
BEGIN;
CREATE TABLE IF NOT EXISTS hero_auction_diamond_registrations (
 account_id TEXT PRIMARY KEY,
 provider TEXT NOT NULL CHECK(provider='google'),
 eligible BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The only free-credit exception: a single fixed 10-diamond new-member gift.
-- This dedicated positive ledger cannot represent arbitrary grants/purchases.
CREATE TABLE IF NOT EXISTS hero_auction_diamond_signup_receipts (
 account_id TEXT PRIMARY KEY REFERENCES hero_auction_diamond_registrations(account_id),
 kind TEXT NOT NULL CHECK(kind='signup_bonus'),
 amount INTEGER NOT NULL CHECK(amount=10),
 balance_before INTEGER NOT NULL CHECK(balance_before=0),
 balance_after INTEGER NOT NULL CHECK(balance_after=10),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(account_id) REFERENCES hero_auction_diamond_wallets(account_id),
 CHECK(balance_after=balance_before+amount)
);
COMMIT;
