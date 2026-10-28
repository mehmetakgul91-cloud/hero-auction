-- DRAFT / NOT AUTO-APPLIED. Explicit approval + isolated real PostgreSQL
-- validation required before applying. Depends on 001 (diamond wallets).
-- No existing account, wallet, reward or level is backfilled/credited here.
BEGIN;
CREATE TABLE IF NOT EXISTS hero_auction_login_reward_receipts (
 account_id TEXT NOT NULL REFERENCES hero_auction_user_profiles(account_id),
 reward_date DATE NOT NULL,
 day_index INTEGER NOT NULL CHECK(day_index BETWEEN 1 AND 7),
 gold_amount INTEGER NOT NULL,
 diamond_amount INTEGER NOT NULL,
 gold_before INTEGER NOT NULL CHECK(gold_before>=0),
 gold_after INTEGER NOT NULL CHECK(gold_after>=0),
 diamonds_before INTEGER NOT NULL CHECK(diamonds_before>=0),
 diamonds_after INTEGER NOT NULL CHECK(diamonds_after>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,reward_date),
 UNIQUE(account_id,reward_date,day_index),
 FOREIGN KEY(account_id) REFERENCES hero_auction_wallets(account_id),
 CHECK((day_index=1 AND gold_amount=100 AND diamond_amount=0)
    OR (day_index=2 AND gold_amount=150 AND diamond_amount=0)
    OR (day_index=3 AND gold_amount=200 AND diamond_amount=0)
    OR (day_index=4 AND gold_amount=250 AND diamond_amount=0)
    OR (day_index=5 AND gold_amount=300 AND diamond_amount=0)
    OR (day_index=6 AND gold_amount=400 AND diamond_amount=0)
    OR (day_index=7 AND gold_amount=0 AND diamond_amount=5)),
 CHECK(gold_after::bigint=gold_before::bigint+gold_amount::bigint),
 CHECK(diamonds_after::bigint=diamonds_before::bigint+diamond_amount::bigint)
);
CREATE TABLE IF NOT EXISTS hero_auction_login_reward_streaks (
 account_id TEXT PRIMARY KEY REFERENCES hero_auction_user_profiles(account_id),
 provider TEXT NOT NULL CHECK(provider='google'),
 last_reward_date DATE NOT NULL,
 day_index INTEGER NOT NULL CHECK(day_index BETWEEN 1 AND 7),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(account_id,last_reward_date,day_index) REFERENCES hero_auction_login_reward_receipts(account_id,reward_date,day_index)
);
COMMIT;
