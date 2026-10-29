-- DRAFT / NOT AUTO-APPLIED. Explicit production preflight + approval required.
-- Depends on the existing gold/room tables and migration 005 dust wallet.
-- Additive only: legacy free bot rooms are never charged or rewarded.
BEGIN;
CREATE TABLE IF NOT EXISTS hero_auction_bot_entries (
 match_id VARCHAR(200) PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES hero_auction_wallets(account_id),
 request_id UUID NOT NULL,
 difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
 config_version TEXT NOT NULL CHECK(config_version='bot-fixed-v1'),
 entry_gold INTEGER NOT NULL CHECK(entry_gold=50),
 gold_before INTEGER NOT NULL CHECK(gold_before>=50),
 gold_after INTEGER NOT NULL CHECK(gold_after>=0 AND gold_after::bigint=gold_before::bigint-50),
 room_state JSONB NOT NULL CHECK(jsonb_typeof(room_state)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(account_id,request_id), UNIQUE(match_id,account_id,config_version)
);
CREATE TABLE IF NOT EXISTS hero_auction_bot_settlements (
 match_id VARCHAR(200) PRIMARY KEY,
 account_id TEXT NOT NULL,
 config_version TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('win','loss','tie','server_failure')),
 gold_amount INTEGER NOT NULL,
 magic_dust_amount INTEGER NOT NULL,
 gold_before INTEGER NOT NULL CHECK(gold_before>=0),
 gold_after INTEGER NOT NULL CHECK(gold_after>=0 AND gold_after::bigint=gold_before::bigint+gold_amount::bigint),
 magic_dust_before INTEGER NOT NULL CHECK(magic_dust_before>=0),
 magic_dust_after INTEGER NOT NULL CHECK(magic_dust_after>=0 AND magic_dust_after::bigint=magic_dust_before::bigint+magic_dust_amount::bigint),
 room_state JSONB NOT NULL CHECK(jsonb_typeof(room_state)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK((outcome='win' AND (gold_amount,magic_dust_amount) IN ((100,0),(125,2),(175,5))) OR (outcome='loss' AND gold_amount=0 AND magic_dust_amount=0) OR (outcome IN ('tie','server_failure') AND gold_amount=50 AND magic_dust_amount=0)),
 FOREIGN KEY(match_id,account_id,config_version) REFERENCES hero_auction_bot_entries(match_id,account_id,config_version)
);
COMMIT;
