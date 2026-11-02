-- LOCAL DRAFT. Requires explicit production approval and PostgreSQL preflight.
-- Adds a no-result, zero-reward idle cancellation. No existing rows rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=public,pg_catalog;
DO $migration$
DECLARE target TEXT; found INTEGER;
BEGIN
 SELECT count(*),min(c.conname) INTO found,target FROM pg_constraint c
 WHERE c.conrelid='public.hero_auction_bot_settlements'::regclass AND c.contype='c' AND c.convalidated
 AND ARRAY(SELECT a.attname::text FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k ORDER BY a.attname)=ARRAY['outcome'];
 IF found<>1 THEN RAISE EXCEPTION 'Expected exactly one existing bot outcome constraint'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.hero_auction_bot_settlements'::regclass AND conname='hero_bot_settlement_version_rewards' AND convalidated) THEN RAISE EXCEPTION 'Bot free-entry migration must be installed first'; END IF;
 EXECUTE format('ALTER TABLE public.hero_auction_bot_settlements DROP CONSTRAINT %I',target);
END;
$migration$;
ALTER TABLE hero_auction_bot_settlements DROP CONSTRAINT hero_bot_settlement_version_rewards;
ALTER TABLE hero_auction_bot_settlements
 ADD CONSTRAINT hero_bot_settlement_idle_outcome CHECK(outcome IN ('win','loss','tie','server_failure','idle_cancelled')),
 ADD CONSTRAINT hero_bot_settlement_idle_rewards CHECK (
  config_version IN ('bot-fixed-v1','bot-free-v2') AND (
   (outcome='win' AND (gold_amount,magic_dust_amount) IN ((100,0),(125,2),(175,5))) OR
   (outcome IN ('loss','idle_cancelled') AND gold_amount=0 AND magic_dust_amount=0) OR
   (outcome IN ('tie','server_failure') AND magic_dust_amount=0 AND
    ((config_version='bot-fixed-v1' AND gold_amount=50) OR (config_version='bot-free-v2' AND gold_amount=0)))
  )
 );
-- Preserve the old verifier's named constraint with exactly equivalent updated
-- economics; old app versions remain able to admit and settle ordinary matches.
ALTER TABLE hero_auction_bot_settlements ADD CONSTRAINT hero_bot_settlement_version_rewards CHECK (
 config_version IN ('bot-fixed-v1','bot-free-v2') AND (
 (outcome='win' AND (gold_amount,magic_dust_amount) IN ((100,0),(125,2),(175,5))) OR
 (outcome IN ('loss','idle_cancelled') AND gold_amount=0 AND magic_dust_amount=0) OR
 (outcome IN ('tie','server_failure') AND magic_dust_amount=0 AND ((config_version='bot-fixed-v1' AND gold_amount=50) OR (config_version='bot-free-v2' AND gold_amount=0)))
 ));
COMMIT;
