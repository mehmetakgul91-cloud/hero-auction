-- Explicit production approval required. Apply before deploying the v2 server.
-- No balances, existing entries, receipts or room state are rewritten.
-- Old paid v1 entries remain valid and retain their exact 50-gold refund rights.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=public,pg_catalog;
ALTER TABLE hero_auction_bot_entries
 DROP CONSTRAINT hero_auction_bot_entries_config_version_check,
 DROP CONSTRAINT hero_auction_bot_entries_entry_gold_check,
 DROP CONSTRAINT hero_auction_bot_entries_gold_before_check,
 DROP CONSTRAINT hero_auction_bot_entries_gold_after_check,
 ADD CONSTRAINT hero_bot_entry_version_price CHECK ((config_version='bot-fixed-v1' AND entry_gold=50) OR (config_version='bot-free-v2' AND entry_gold=0)),
 ADD CONSTRAINT hero_bot_entry_balance CHECK (gold_before>=entry_gold AND gold_after>=0 AND gold_after::bigint=gold_before::bigint-entry_gold::bigint);
ALTER TABLE hero_auction_bot_settlements
 DROP CONSTRAINT hero_auction_bot_settlements_check,
 ADD CONSTRAINT hero_bot_settlement_version_rewards CHECK (
  config_version IN ('bot-fixed-v1','bot-free-v2') AND (
   (outcome='win' AND (gold_amount,magic_dust_amount) IN ((100,0),(125,2),(175,5))) OR
   (outcome='loss' AND gold_amount=0 AND magic_dust_amount=0) OR
   (outcome IN ('tie','server_failure') AND magic_dust_amount=0 AND
    ((config_version='bot-fixed-v1' AND gold_amount=50) OR (config_version='bot-free-v2' AND gold_amount=0)))
  )
 );
COMMIT;
