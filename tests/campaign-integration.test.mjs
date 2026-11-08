import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('optional campaign API uses signed identity and existing owner guard; no gameplay event writes',()=>{
 const s=read('server.js'),api=s.slice(s.indexOf("if(url.startsWith('/api/campaign/'))"),s.indexOf("if(url.startsWith('/api/player-sessions/'))"));
 assert.match(api,/identity=readLogin\(b.authToken\)/);assert.match(api,/campaignPolicy.enabled/);assert.match(api,/campaignStorageReady/);assert.doesNotMatch(api,/b.accountId|b.matchId|b.outcome|b.url|b.source/);
 const admin=s.slice(s.indexOf('async function adminApi'),s.indexOf("if(url==='/api/admin/location-status')"));assert.ok(admin.indexOf('isOwnerAdmin')<admin.indexOf("'/api/admin/campaign-funnel'"));
 assert.doesNotMatch(read('bot-economy.js'),/campaign/i);assert.match(s,/catch\{campaignStorageReady=false/);
 assert.match(s,/campaignPolicy.enabled&&campaignStorageReady\?campaignPolicy.campaigns:\[\]/);
});
test('auth-bound client hook cannot block intro; reward time remains 02.00 and admin is aggregate only',()=>{
 const app=read('public/app.js'),intro=read('public/new-player-intro.js');
 assert.match(app,/authToken:auth/);assert.match(app,/campaignMeasurement.setLogin\(login\)/);assert.match(app,/campaignMeasurement.setLogin\(null\)/);
 assert.match(app,/try\{return window.sessionStorage\}catch\{return null\}/);assert.match(intro,/try\{onEvent\(event\);\}catch\{\}/);
 for(const e of ['intro_viewed','intro_completed','intro_skipped'])assert.ok(intro.includes("report('"+e+"')"));
 assert.match(read('public/index.html'),/Türkiye saatiyle 02\.00/);assert.match(read('public/admin.js'),/import\('\/admin-campaign.js'\)/);
 assert.match(read('public/privacy.html'),/kampanya ölçümünde tam bağlantı/);assert.match(read('docs/campaign-measurement.md'),/unapplied draft/);
});
