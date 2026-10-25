-- DRAFT / NOT AUTO-APPLIED. Explicitly authorize and test on isolated PostgreSQL
-- before any deployment. No existing wallet/profile/level is updated or charged.
BEGIN;
CREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets (
 account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id),
 diamonds INTEGER NOT NULL DEFAULT 0 CHECK(diamonds>=0)
);
CREATE TABLE IF NOT EXISTS hero_auction_upgrade_receipts (
 account_id TEXT NOT NULL REFERENCES hero_auction_wallets(account_id),
 request_id VARCHAR(100) NOT NULL,
 commander_id TEXT NOT NULL CHECK(commander_id IN ('attack','defense','magic','support')),
 stat TEXT NOT NULL CHECK(stat IN ('attack','defense','magic','support')),
 from_level INTEGER NOT NULL CHECK(from_level>=0 AND from_level<40),
 to_level INTEGER NOT NULL CHECK(to_level=from_level+1),
 gold_cost INTEGER NOT NULL CHECK(gold_cost>0),
 diamond_cost INTEGER NOT NULL CHECK(diamond_cost>=0),
 pricing_version TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,request_id),
 CHECK((from_level<20 AND diamond_cost=0) OR (from_level>=20 AND diamond_cost>0))
);
-- This release only spends diamonds. Positive entries are intentionally invalid;
-- a future verified-payment integration needs its own reviewed credit migration.
CREATE TABLE IF NOT EXISTS hero_auction_diamond_ledger (
 id BIGSERIAL PRIMARY KEY,
 account_id TEXT NOT NULL,
 request_id VARCHAR(100) NOT NULL,
 kind TEXT NOT NULL DEFAULT 'commander_upgrade' CHECK(kind='commander_upgrade'),
 delta INTEGER NOT NULL CHECK(delta<0),
 balance_before INTEGER NOT NULL CHECK(balance_before>=0),
 balance_after INTEGER NOT NULL CHECK(balance_after>=0 AND balance_after=balance_before+delta),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(account_id,request_id),
 FOREIGN KEY(account_id,request_id) REFERENCES hero_auction_upgrade_receipts(account_id,request_id)
);
COMMIT;
