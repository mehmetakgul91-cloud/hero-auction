import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveCommanderSelectionCapability} from '../commander-client-capability.js';

const profile=commanderId=>({commanderId,levels:{attack:3,defense:4,magic:5,support:6}});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

function room(){
 return {
  code:'123',created:100,matchNumber:1,phase:'finished',mode:'bot',
  players:[{accountId:'account-a',token:'token-a',credits:7,team:[{id:'hero-a'}]},{accountId:'account-b',token:'token-b',credits:4,team:[{id:'hero-b'}]}],
  battleSync:{key:'1:100',ready:[{positions:[0]},{positions:[0]}],commanderChoices:[profile('attack'),profile('support')],commanderChoiceSources:['legacy','legacy'],result:null},
  botEntry:{matchId:'123:1:100',entryGold:0},series:[1,2],goldAward:null,
 };
}

test('a capability latched while settlement awaits survives the eventual older room snapshot',async()=>{
 const current=room();current.battleSync.result={live:true,finished:true,commanders:[profile('attack'),profile('support')]};
 const saved=structuredClone(current);saved.matchSettled=true;saved.botSettlementReceipt={outcome:'win',gold:100};
 const commit=deferred();
 const installation=(async()=>{
  const replacement=await commit.promise;
  preserveCommanderSelectionCapability(current,replacement);
  Object.assign(current,replacement);
 })();
 current.players[0].matchCommanderSelection=1;
 commit.resolve(saved);await installation;
 assert.equal(current.players[0].matchCommanderSelection,1);
 assert.equal(current.players[1].matchCommanderSelection,undefined);
 assert.equal(current.matchSettled,true);
 assert.deepEqual(current.botSettlementReceipt,{outcome:'win',gold:100});
 assert.deepEqual(current.battleSync.result.commanders,[profile('attack'),profile('support')]);
 assert.deepEqual(current.battleSync.commanderChoiceSources,['legacy','legacy'],'a completed battle remains authoritative');
});

for(const seat of [0,1])test(`only matching seat ${seat} inherits capability and loses its pending legacy choice`,()=>{
 const current=room(),replacement=structuredClone(current);current.players[seat].matchCommanderSelection=1;
 const before=structuredClone(current),other=1-seat,otherChoice=structuredClone(replacement.battleSync.commanderChoices[other]);
 preserveCommanderSelectionCapability(current,replacement);
 assert.equal(replacement.players[seat].matchCommanderSelection,1);
 assert.equal(replacement.players[other].matchCommanderSelection,undefined);
 assert.equal(replacement.battleSync.commanderChoices[seat],null);
 assert.equal(replacement.battleSync.commanderChoiceSources[seat],null);
 assert.deepEqual(replacement.battleSync.commanderChoices[other],otherChoice);
 assert.equal(replacement.battleSync.commanderChoiceSources[other],'legacy');
 assert.deepEqual(replacement.battleSync.ready,before.battleSync.ready,'capability preservation must not undo confirmed formation');
 assert.deepEqual(current,before,'the current authority is not mutated while preparing a replacement');
});

test('same authenticated seat carries capability through a rematch without copying prior commander choices',()=>{
 const current=room();current.players[0].matchCommanderSelection=1;
 const replacement=room();replacement.created=200;replacement.matchNumber=2;replacement.phase='auction';replacement.battleSync=null;
 preserveCommanderSelectionCapability(current,replacement);
 assert.equal(replacement.players[0].matchCommanderSelection,1);
 assert.equal(replacement.matchNumber,2);assert.equal(replacement.created,200);
 assert.equal(replacement.battleSync,null);
 assert.deepEqual(replacement.series,[1,2]);
});

for(const mismatch of ['room-code','account','token','empty-account','empty-token','missing-account','missing-token','seat-moved'])test(`${mismatch} prevents capability inheritance or choice clearing`,()=>{
 const current=room(),replacement=structuredClone(current);current.players[0].matchCommanderSelection=1;
 if(mismatch==='room-code')replacement.code='456';
 if(mismatch==='account')replacement.players[0].accountId='another-account';
 if(mismatch==='token')replacement.players[0].token='another-token';
 if(mismatch==='empty-account')current.players[0].accountId=replacement.players[0].accountId='';
 if(mismatch==='empty-token')current.players[0].token=replacement.players[0].token='';
 if(mismatch==='missing-account'){delete current.players[0].accountId;delete replacement.players[0].accountId;}
 if(mismatch==='missing-token'){delete current.players[0].token;delete replacement.players[0].token;}
 if(mismatch==='seat-moved')replacement.players.reverse();
 const before=structuredClone(replacement),authority=structuredClone(current);
 preserveCommanderSelectionCapability(current,replacement);
 assert.deepEqual(replacement,before);
 assert.deepEqual(current,authority);
});

test('server-controlled bot seats without an authenticated account never inherit a marker',()=>{
 const current=room(),replacement=structuredClone(current);
 delete current.players[1].accountId;delete replacement.players[1].accountId;
 current.players[1].matchCommanderSelection=1;
 replacement.battleSync.commanderChoiceSources[1]='bot';
 const before=structuredClone(replacement);
 preserveCommanderSelectionCapability(current,replacement);
 assert.deepEqual(replacement,before);
});

for(const source of ['explicit','bot',null,undefined])test(`capability preservation does not clear a ${String(source)} choice`,()=>{
 const current=room(),replacement=structuredClone(current);current.players[0].matchCommanderSelection=1;
 replacement.battleSync.commanderChoiceSources[0]=source;
 const before=structuredClone(replacement.battleSync);
 preserveCommanderSelectionCapability(current,replacement);
 assert.equal(replacement.players[0].matchCommanderSelection,1);
 assert.deepEqual(replacement.battleSync,before);
});

test('an already-started battle and its profile snapshots are untouched',()=>{
 const current=room(),replacement=structuredClone(current);current.players.forEach(player=>player.matchCommanderSelection=1);
 replacement.battleSync.result={live:true,finished:false,commanders:[profile('attack'),profile('support')]};
 const before=structuredClone(replacement.battleSync);
 preserveCommanderSelectionCapability(current,replacement);
 assert.deepEqual(replacement.players.map(player=>player.matchCommanderSelection),[1,1]);
 assert.deepEqual(replacement.battleSync,before);
});

test('preservation is idempotent and changes no money, cards, account profile, or settlement data',()=>{
 const current=room(),replacement=structuredClone(current);current.players[0].matchCommanderSelection=1;
 replacement.players[0].commander=profile('magic');replacement.goldRefunds=[{amount:50}];replacement.botSettlementReceipt={outcome:'tie',gold:0};
 const expected=structuredClone(replacement);
 expected.players[0].matchCommanderSelection=1;
 expected.battleSync.commanderChoices[0]=null;expected.battleSync.commanderChoiceSources[0]=null;
 preserveCommanderSelectionCapability(current,replacement);preserveCommanderSelectionCapability(current,replacement);
 assert.deepEqual(replacement,expected);
});

test('only the exact server-latched marker value is carried, while an existing replacement marker is retained',()=>{
 for(const marker of [undefined,null,0,false,'1',true,2]){
  const current=room(),replacement=structuredClone(current);current.players[0].matchCommanderSelection=marker;
  const before=structuredClone(replacement);
  preserveCommanderSelectionCapability(current,replacement);
  assert.deepEqual(replacement,before,String(marker));
 }
 const current=room(),replacement=structuredClone(current);replacement.players[0].matchCommanderSelection=1;
 replacement.battleSync.commanderChoices[0]=null;replacement.battleSync.commanderChoiceSources[0]=null;
 const before=structuredClone(replacement);
 preserveCommanderSelectionCapability(current,replacement);
 assert.deepEqual(replacement,before);
});
