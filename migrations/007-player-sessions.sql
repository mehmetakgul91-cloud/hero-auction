-- DRAFT / NOT AUTO-APPLIED. Explicit approval and isolated PostgreSQL tests
-- required before production. No historical sessions or wallet balances backfilled.
BEGIN;
CREATE TABLE IF NOT EXISTS hero_auction_player_activity (
 account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id) ON DELETE CASCADE,
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 last_credit_at TIMESTAMPTZ,
 CHECK(last_credit_at IS NULL OR last_credit_at<=last_seen_at)
);
CREATE TABLE IF NOT EXISTS hero_auction_player_sessions (
 account_id TEXT NOT NULL REFERENCES hero_auction_player_activity(account_id) ON DELETE CASCADE,
 session_id VARCHAR(100) NOT NULL CHECK(length(session_id) BETWEEN 16 AND 100 AND session_id !~ '[^a-zA-Z0-9_-]'),
 sequence INTEGER NOT NULL CHECK(sequence>=0 AND sequence<=100000),
 started_at TIMESTAMPTZ NOT NULL,
 last_seen_at TIMESTAMPTZ NOT NULL,
 ended_at TIMESTAMPTZ,
 foreground BOOLEAN NOT NULL,
 active_ms BIGINT NOT NULL DEFAULT 0 CHECK(active_ms>=0 AND active_ms<=86400000),
 source TEXT NOT NULL CHECK(source IN ('direct_or_unknown','google_search','invite','crazygames','external')),
 source_provenance TEXT NOT NULL CHECK(source_provenance IN ('client_reported','verified_platform')),
 platform TEXT NOT NULL CHECK(platform IN ('web','android','unknown')),
 device TEXT NOT NULL CHECK(device IN ('desktop','mobile','tablet','unknown')),
 PRIMARY KEY(account_id,session_id),
 CHECK(last_seen_at>=started_at),
 CHECK(ended_at IS NULL OR ended_at>=started_at),
 CHECK(ended_at IS NULL OR foreground=false)
);
CREATE INDEX IF NOT EXISTS hero_auction_player_sessions_retention ON hero_auction_player_sessions(started_at);
CREATE INDEX IF NOT EXISTS hero_auction_player_sessions_account_seen ON hero_auction_player_sessions(account_id,last_seen_at DESC);
-- No raw URLs, query parameters, tokens, IP addresses, user-agent strings,
-- or location data are collected or stored.
COMMIT;
