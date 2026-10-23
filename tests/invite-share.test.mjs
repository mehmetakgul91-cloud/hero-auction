import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInviteSharer,inviteUrl} from '../public/invite-share.js';
function fixture(navigator={}){
 const calls={shares:[],copies:[],notices:[],links:[]};
 const nav={share:async value=>calls.shares.push(value),clipboard:{writeText:async value=>calls.copies.push(value)},...navigator};
 const c=createInviteSharer({origin:'https://heroauction.com.tr',navigator:nav,notify:value=>calls.notices.push(value),showLink:value=>calls.links.push(value)});
 return {c,calls};
}
test('link preserves current server and leading zero code, removes unrelated path/query',()=>{
 assert.equal(inviteUrl('012','https://game.test/some/path?x=1'),'https://game.test/?join=012');
 for(const code of ['',undefined,'12','1234','123&admin=1'])assert.throws(()=>inviteUrl(code,'https://game.test'));
});
test('native share is called synchronously with exact receiver URL, no clipboard mutation',async()=>{
 const {c,calls}=fixture();const promise=c.share('012');
 assert.equal(calls.shares.length,1);assert.equal(calls.shares[0].url,'https://heroauction.com.tr/?join=012');
 await promise;assert.deepEqual(calls.copies,[]);assert.deepEqual(calls.links,[]);
});
test('native cancellation does not copy, show fallback or report failure',async()=>{
 const {c,calls}=fixture({share:async()=>{throw Object.assign(Error(),{name:'AbortError'})}});
 await c.share('123');assert.deepEqual(calls,{shares:[],copies:[],notices:[],links:[]});
});
test('unsupported share and denied native share copy exact link without navigation',async()=>{
 for(const share of [undefined,async()=>{throw Object.assign(Error(),{name:'NotAllowedError'})}]){
  const {c,calls}=fixture({share});await c.share('123');assert.deepEqual(calls.copies,['https://heroauction.com.tr/?join=123']);assert.equal(calls.notices.length,1);
 }
});
test('clipboard unavailable/denied exposes link for manual copy without false success',async()=>{
 for(const clipboard of [undefined,{writeText:async()=>{throw Error('denied')}}]){
  const {c,calls}=fixture({share:undefined,clipboard});await c.share('123');assert.deepEqual(calls.links,['https://heroauction.com.tr/?join=123']);assert.deepEqual(calls.notices,[]);
 }
});
test('explicit copy bypasses native share',async()=>{
 const {c,calls}=fixture();await c.copy('123');assert.equal(calls.shares.length,0);assert.equal(calls.copies.length,1);
});
test('rapid taps and copy during pending sheet are deduplicated, cancellation allows retry',async()=>{
 let release,count=0;const {c}=fixture({share:()=>{count++;return new Promise(resolve=>release=resolve)}});
 const first=c.share('123');await c.share('123');await c.copy('123');assert.equal(count,1);release();await first;
 const second=c.share('456');assert.equal(count,2);release();await second;
});
test('app wiring retains platform branch and never opens a WhatsApp tab',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(source.includes("from '/invite-share.js'"));assert.ok(source.includes('await window.HeroPlatform.inviteLink(code)'));
 assert.ok(source.includes("copy.id='copy-invite-link'"));assert.ok(source.includes('await inviteSharer.share(code)'));
 assert.ok(!source.includes('window.open('));assert.ok(!source.includes('wa.me'));
});
