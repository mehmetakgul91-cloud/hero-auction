-- Explicit production approval required. Apply before deploying the v2 server.
-- No balances, existing entries, receipts or room state are rewritten.
-- Old paid v1 entries remain valid and retain their exact 50-gold refund rights.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=public,pg_catalog;
-- PostgreSQL chooses table-level names when a CHECK references multiple
-- columns, even when written inline. Resolve only the exact original column
-- sets, require all five original checks, then drop their catalog-quoted names.
DO $migration$
DECLARE item RECORD; targets JSONB;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('table',table_name,'name',conname)) INTO targets
 FROM (
  SELECT c.conname,t.relname AS table_name,
   ARRAY(SELECT a.attname::text FROM unnest(c.conkey) k
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k ORDER BY a.attname) AS columns
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
  WHERE c.contype='c' AND c.convalidated AND c.conrelid IN
   ('public.hero_auction_bot_entries'::regclass,'public.hero_auction_bot_settlements'::regclass)
 ) checks
 WHERE (table_name='hero_auction_bot_entries' AND columns IN
  (ARRAY['config_version'],ARRAY['entry_gold'],ARRAY['gold_before'],ARRAY['gold_after','gold_before']))
 OR (table_name='hero_auction_bot_settlements' AND columns=ARRAY['gold_amount','magic_dust_amount','outcome']);
 IF COALESCE(jsonb_array_length(targets),0)<>5 THEN
  RAISE EXCEPTION 'Expected exactly five original bot ledger CHECK constraints; no changes applied';
 END IF;
 FOR item IN SELECT value->>'table' AS table_name,value->>'name' AS constraint_name FROM jsonb_array_elements(targets)
 LOOP EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',item.table_name,item.constraint_name); END LOOP;
END;
$migration$;
ALTER TABLE hero_auction_bot_entries
 ADD CONSTRAINT hero_bot_entry_version_price CHECK ((config_version='bot-fixed-v1' AND entry_gold=50) OR (config_version='bot-free-v2' AND entry_gold=0)),
 ADD CONSTRAINT hero_bot_entry_balance CHECK (gold_before>=entry_gold AND gold_after>=0 AND gold_after::bigint=gold_before::bigint-entry_gold::bigint);
ALTER TABLE hero_auction_bot_settlements
 ADD CONSTRAINT hero_bot_settlement_version_rewards CHECK (
  config_version IN ('bot-fixed-v1','bot-free-v2') AND (
   (outcome='win' AND (gold_amount,magic_dust_amount) IN ((100,0),(125,2),(175,5))) OR
   (outcome='loss' AND gold_amount=0 AND magic_dust_amount=0) OR
   (outcome IN ('tie','server_failure') AND magic_dust_amount=0 AND
    ((config_version='bot-fixed-v1' AND gold_amount=50) OR (config_version='bot-free-v2' AND gold_amount=0)))
  )
 );
COMMIT;
