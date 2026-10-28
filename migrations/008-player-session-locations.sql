-- Explicit deployment approval required. Additive; no accounts, wallets, games,
-- existing sessions or historical location records are changed/backfilled.
BEGIN;
CREATE TABLE IF NOT EXISTS hero_auction_player_session_locations (
 account_id TEXT NOT NULL,
 session_id VARCHAR(100) NOT NULL,
 country VARCHAR(2) NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
 city VARCHAR(100) CHECK(city IS NULL OR (length(city) BETWEEN 1 AND 100 AND city !~ '[[:cntrl:]]')),
 PRIMARY KEY(account_id,session_id),
 FOREIGN KEY(account_id,session_id) REFERENCES hero_auction_player_sessions(account_id,session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS hero_auction_player_sessions_report_order ON hero_auction_player_sessions(started_at DESC,account_id,session_id);
-- Country/city only. Retention follows the parent session's existing 30-day purge.
COMMIT;
