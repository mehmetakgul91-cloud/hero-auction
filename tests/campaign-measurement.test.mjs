import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCampaignPolicy,attributeCampaign,recordCampaignIntro,readCampaignFunnel,cleanupCampaignMeasurement,deleteCampaignMeasurement,CAMPAIGN_ATTRIBUTE_SQL,CAMPAIGN_FUNNEL_SQL,preflightCampaignMeasurement} from '../campaign-measurement.js';
const roster=[{id:'launch',source:'instagram',medium:'social',campaign:'launch'}];
const env={HERO_PLAYER_ANALYTICS_ENABLED:'1',HERO_CAMPAIGN_MEASUREMENT_ENABLED:'1',HERO_CAMPAIGNS:JSON.stringify(roster)},policy=createCampaignPolicy(env),identity={sub:'guest:example',provider:'guest'};
const fixture=(rows=[])=>{const calls=[];return{calls,query:async(q,v)=>{calls.push(typeof q==='string'?{text:q,values:v}:q);return {rows,rowCount:rows.length};}};};
test('configuration fails closed unless both flags and exact bounded allowlist are valid',()=>{
 assert.equal(policy.enabled,true);assert.equal(createCampaignPolicy({}).enabled,false);
 for(const change of [{HERO_PLAYER_ANALYTICS_ENABLED:'0'},{HERO_CAMPAIGN_MEASUREMENT_ENABLED:'0'},{HERO_CAMPAIGNS:'no'}, {HERO_CAMPAIGNS:'[]'}, {HERO_CAMPAIGNS:JSON.stringify([...roster,...roster])},{HERO_CAMPAIGNS:JSON.stringify([{...roster[0],url:'private'}])},{HERO_CAMPAIGNS:JSON.stringify([{...roster[0],id:'x'.repeat(49)}])}])assert.equal(createCampaignPolicy({...env,...change}).enabled,false);
});
test('attribute accepts only canonical configured ID from verified web identity',async()=>{
 const db=fixture([{campaign_id:'launch'}]);
 assert.deepEqual(await attributeCampaign({database:db,policy,identity,request:{campaignId:'launch'}}),{accepted:true});
 assert.deepEqual(db.calls[0].values,['guest:example','launch']);assert.equal(db.calls[0].query_timeout,1500);
 for(const request of [{campaignId:'unknown'},{campaignId:'launch',gclid:'private'},{event:'first_bot_started'},{}])await assert.rejects(attributeCampaign({database:db,policy,identity,request}),e=>e.status===400);
 await assert.rejects(attributeCampaign({database:db,policy,identity:{sub:'x',provider:'crazygames'},request:{campaignId:'launch'}}),e=>e.status===401);
 assert.equal(db.calls.length,1);
});
test('newcomer admission is an insert-select with durable history checks; replay never updates first touch',async()=>{
 const db=fixture();assert.deepEqual(await attributeCampaign({database:db,policy,identity,request:{campaignId:'launch'}}),{accepted:false});assert.equal(db.calls.length,2);
 for(const table of ['wallets','commanders','bot_entries','gold_awards','victory_chest_receipts','rooms','social'])assert.match(CAMPAIGN_ATTRIBUTE_SQL,new RegExp('hero_auction_'+table));
 assert.match(CAMPAIGN_ATTRIBUTE_SQL,/ON CONFLICT\(account_id\) DO NOTHING/);assert.doesNotMatch(CAMPAIGN_ATTRIBUTE_SQL,/UPDATE|INSERT INTO hero_auction_wallets/);
});
test('client stage endpoint cannot synthesize server match starts or completions',async()=>{
 const db=fixture();for(const event of ['intro_viewed','intro_completed','intro_skipped'])await recordCampaignIntro({database:db,policy,identity,request:{event}});
 for(const request of [{event:'first_bot_started'},{event:'first_bot_completed'},{event:'intro_viewed',accountId:'another'},{event:'__proto__'}])await assert.rejects(recordCampaignIntro({database:db,policy,identity,request}));
 assert.equal(db.calls.length,3);for(const call of db.calls){assert.match(call.text,/IS NULL/);assert.match(call.text,/interval '30 days'/);assert.equal(call.values[0],identity.sub);}
});
test('report chooses first ever entry before free-easy filtering and separates durable terminal provenance',async()=>{
 assert.match(CAMPAIGN_FUNNEL_SQL,/ORDER BY b.created_at,b.match_id LIMIT 1\s*\) e ON e.created_at>=c.attributed_at AND NOT EXISTS/);
 assert.match(CAMPAIGN_FUNNEL_SQL,/ambiguous.created_at=e.created_at AND ambiguous.match_id<>e.match_id/);
 assert.match(CAMPAIGN_FUNNEL_SQL,/e.entry_gold=0 AND e.config_version='bot-free-v2'/);
 assert.match(CAMPAIGN_FUNNEL_SQL,/hero_auction_bot_settlements/);assert.match(CAMPAIGN_FUNNEL_SQL,/battleSync,result,finished/);
 for(const stage of ['forfeit','server_failure','idle_cancelled','other_terminal','pending'])assert.match(CAMPAIGN_FUNNEL_SQL,new RegExp("'"+stage+"'"));
 const row={campaign_id:'launch',account_id:'must-not-leak',url:'private'};for(const key of ['authenticated','intro_viewed','intro_completed','intro_skipped','first_bot_started','first_bot_completed','forfeited','server_failures','idle_cancelled','pending','other_terminal'])row[key]='1';
 const out=await readCampaignFunnel({database:fixture([row]),policy,days:30});assert.equal(out.campaigns[0].authenticated,1);assert.doesNotMatch(JSON.stringify(out),/must-not-leak|private|account_id|url/);
 for(const days of [0,31,1.5,'7'])await assert.rejects(readCampaignFunnel({database:fixture(),policy,days}));
});
test('retention and explicit erasure work independently of collection flag without touching economy',async()=>{
 const db=fixture();await cleanupCampaignMeasurement({database:db});await deleteCampaignMeasurement({database:db,accountIds:['guest:a']});
 assert.match(db.calls[0].text,/interval '30 days'.*LIMIT 1000/);assert.deepEqual(db.calls[1].values,[['guest:a']]);
 for(const call of db.calls)assert.match(call.text,/^DELETE FROM hero_auction_campaign_funnel/);
 await assert.rejects(deleteCampaignMeasurement({database:db,accountIds:Array(101).fill('a')}));
 assert.equal(await preflightCampaignMeasurement(null),false);
 const sql=readFileSync('migrations/012-campaign-measurement.sql','utf8');assert.match(sql,/ON DELETE CASCADE/);assert.doesNotMatch(sql,/ALTER TABLE|DROP TABLE|UPDATE |INSERT INTO/);
});
