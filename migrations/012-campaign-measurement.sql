-- LOCAL DRAFT. Manual production approval/preflight required; never auto-applied.
-- Pure analytics; no currency, commander, room, bot entry or settlement changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=public,pg_catalog;
CREATE TABLE hero_auction_campaign_funnel (
 account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id) ON DELETE CASCADE,
 campaign_id VARCHAR(48) NOT NULL CHECK(campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,47}$'),
 attributed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 intro_viewed_at TIMESTAMPTZ,
 intro_completed_at TIMESTAMPTZ,
 intro_skipped_at TIMESTAMPTZ,
 CHECK(intro_viewed_at IS NULL OR intro_viewed_at>=attributed_at),
 CHECK(intro_completed_at IS NULL OR intro_completed_at>=attributed_at),
 CHECK(intro_skipped_at IS NULL OR intro_skipped_at>=attributed_at)
);
CREATE INDEX hero_auction_campaign_expiry ON hero_auction_campaign_funnel(attributed_at);
COMMIT;
