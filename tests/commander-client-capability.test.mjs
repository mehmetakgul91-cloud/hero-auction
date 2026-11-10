import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commanderSelectionClient} from '../commander-client-capability.js';
const old={headers:{'user-agent':'okhttp/4.12.0'}};

test('only the exact old native transport is a legacy candidate, not an identity proof',()=>{
 assert.equal(commanderSelectionClient(old),'legacy');
 for(const headers of [{},{'user-agent':'okhttp/4.12.1'},{'user-agent':'okhttp/4.12.0 extra'},{'user-agent':'HeroAuctionNative/17'}, {...old.headers,origin:'https://localhost'}, {...old.headers,'sec-fetch-mode':'cors'}, {...old.headers,'sec-fetch-site':'none'}])assert.equal(commanderSelectionClient({headers}),'selection');
});
test('any capability declaration prevents a silent legacy downgrade',()=>{
 for(const value of [1,'1',0,'0','',null,false,'invalid']){
  assert.equal(commanderSelectionClient({headers:{...old.headers,'x-hero-match-commander-selection':value}}),'selection');
  assert.equal(commanderSelectionClient(old,{body:{matchCommanderSelection:value}}),'selection');
  assert.equal(commanderSelectionClient(old,{searchParams:new URLSearchParams({matchCommanderSelection:value})}),'selection');
 }
});
test('web preparation and match selection positively declare the current protocol',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 for(const route of ['preview','team']){
  const calls=[...source.matchAll(new RegExp("'/api/battle-auction-"+route+"\\?([^']*)'",'g'))];
  assert.ok(calls.length>0);for(const call of calls)assert.match(call[1],/^matchCommanderSelection=1&code=$/);
 }
 assert.match(source,/JSON.stringify\(\{code:auctionCode,token:auctionToken,matchKey:preparationMatchKey,matchCommanderSelection:1,\.\.\.formation\}\)/);
 const picker=readFileSync(new URL('../public/match-commander-picker.js',import.meta.url),'utf8');
 assert.match(picker,/new URLSearchParams\(\{code,token,matchKey,matchCommanderSelection:1\}\)/);
 assert.match(picker,/commanderId,matchCommanderSelection:1,authToken:getAuthToken\(\)/);
});
