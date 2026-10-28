-- DRAFT / NOT AUTO-APPLIED. Explicit production preflight + approval required.
-- Apply after 001..004. No account balance/profile/level is backfilled or charged.
BEGIN;
CREATE TABLE IF NOT EXISTS hero_auction_magic_dust_wallets (
 account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id),
 magic_dust INTEGER NOT NULL DEFAULT 0 CHECK(magic_dust>=0)
);
ALTER TABLE hero_auction_upgrade_receipts ADD COLUMN IF NOT EXISTS magic_dust_cost INTEGER NOT NULL DEFAULT 0 CHECK(magic_dust_cost>=0);
CREATE TABLE IF NOT EXISTS hero_auction_magic_dust_upgrade_ledger (
 account_id TEXT NOT NULL,
 request_id VARCHAR(100) NOT NULL,
 delta INTEGER NOT NULL CHECK(delta<0),
 balance_before INTEGER NOT NULL CHECK(balance_before>=0),
 balance_after INTEGER NOT NULL CHECK(balance_after>=0 AND balance_after::bigint=balance_before::bigint+delta::bigint),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,request_id),
 FOREIGN KEY(account_id,request_id) REFERENCES hero_auction_upgrade_receipts(account_id,request_id)
);
-- Durable server-only rolled outcome, saved before any presentation/credit. A
-- failed credit remains retryable with exactly these quantities/version.
CREATE TABLE IF NOT EXISTS hero_auction_victory_chest_intents (
 match_id VARCHAR(200) PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES hero_auction_wallets(account_id),
 winner_seat INTEGER NOT NULL CHECK(winner_seat IN (0,1)),
 config_version VARCHAR(100) NOT NULL,
 gold_amount INTEGER NOT NULL CHECK(gold_amount IN (100,105,110,115,120)),
 magic_dust_amount INTEGER NOT NULL CHECK(magic_dust_amount IN (0,3,4,5)),
 diamond_amount INTEGER NOT NULL CHECK(diamond_amount IN (0,1)),
 room_state JSONB NOT NULL CHECK(jsonb_typeof(room_state)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(match_id,account_id,config_version,gold_amount,magic_dust_amount,diamond_amount)
);
CREATE INDEX IF NOT EXISTS hero_auction_victory_chest_intents_room ON hero_auction_victory_chest_intents ((room_state->>'code'));
-- This receipt IS the positive three-currency ledger; the existing negative
-- diamond upgrade ledger remains unchanged. Credit+receipt commit together.
CREATE TABLE IF NOT EXISTS hero_auction_victory_chest_receipts (
 match_id VARCHAR(200) PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES hero_auction_wallets(account_id),
 config_version VARCHAR(100) NOT NULL,
 gold_amount INTEGER NOT NULL,
 magic_dust_amount INTEGER NOT NULL,
 diamond_amount INTEGER NOT NULL,
 gold_before INTEGER NOT NULL CHECK(gold_before>=0),
 gold_after INTEGER NOT NULL CHECK(gold_after>=0 AND gold_after::bigint=gold_before::bigint+gold_amount::bigint),
 magic_dust_before INTEGER NOT NULL CHECK(magic_dust_before>=0),
 magic_dust_after INTEGER NOT NULL CHECK(magic_dust_after>=0 AND magic_dust_after::bigint=magic_dust_before::bigint+magic_dust_amount::bigint),
 diamonds_before INTEGER NOT NULL CHECK(diamonds_before>=0),
 diamonds_after INTEGER NOT NULL CHECK(diamonds_after>=0 AND diamonds_after::bigint=diamonds_before::bigint+diamond_amount::bigint),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(match_id,account_id,config_version,gold_amount,magic_dust_amount,diamond_amount)
 REFERENCES hero_auction_victory_chest_intents(match_id,account_id,config_version,gold_amount,magic_dust_amount,diamond_amount)
);
COMMIT;
