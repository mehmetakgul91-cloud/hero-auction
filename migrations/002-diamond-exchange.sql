-- DRAFT / NOT AUTO-APPLIED. Requires explicit migration/deployment approval and
-- prior 001-paid-diamonds-foundation.sql; no existing balances are changed.
BEGIN;
-- Durable idempotency receipt AND a two-currency movement ledger. An entry can
-- only spend existing diamonds and credit the server-configured amount of gold.
CREATE TABLE IF NOT EXISTS hero_auction_diamond_exchanges (
 account_id TEXT NOT NULL REFERENCES hero_auction_diamond_wallets(account_id),
 request_id VARCHAR(100) NOT NULL,
 kind TEXT NOT NULL DEFAULT 'diamonds_to_gold' CHECK(kind='diamonds_to_gold'),
 diamonds_spent INTEGER NOT NULL CHECK(diamonds_spent>0),
 gold_granted INTEGER NOT NULL CHECK(gold_granted>0),
 exchange_rate INTEGER NOT NULL CHECK(exchange_rate>0),
 pricing_version VARCHAR(100) NOT NULL,
 diamond_balance_before INTEGER NOT NULL CHECK(diamond_balance_before>=0),
 diamond_balance_after INTEGER NOT NULL CHECK(diamond_balance_after>=0),
 gold_balance_before INTEGER NOT NULL CHECK(gold_balance_before>=0),
 gold_balance_after INTEGER NOT NULL CHECK(gold_balance_after>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,request_id),
 CHECK(gold_granted::bigint=diamonds_spent::bigint*exchange_rate::bigint),
 CHECK(diamond_balance_after::bigint=diamond_balance_before::bigint-diamonds_spent::bigint),
 CHECK(gold_balance_after::bigint=gold_balance_before::bigint+gold_granted::bigint)
);
COMMIT;
