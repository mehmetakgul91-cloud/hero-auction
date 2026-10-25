import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'node:http';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {viewLiveCommanderAbilities} from '../commander-live-abilities.js';
// Deterministic HTTP serialization regression for the EXACT server response
// expressions. Authentication/auction lifecycle has separate end-to-end tests;
// this fixture avoids waiting for random drafts to produce a revival window.
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const liveExpression=source.match(/const snapshot=\(\)=>\{const current=liveArenaLifecycle\.snapshot\([\s\S]*?\};(?=\n try\{)/)?.[0];
const previewExpression=source.split('\n').find(line=>line.includes('return send(200,{ready:sync.ready.map(Boolean),started:Boolean(sync.result)'));
assert.ok(liveExpression,'production live snapshot expression');assert.ok(previewExpression,'production initial-result expression');
const liveSnapshot=new Function('liveArenaLifecycle','liveKey','body','sinceVersion','side','orientBattleSummary',liveExpression+'return snapshot();');
const previewSnapshot=new Function('send','sync','seat','orientBattleSummary',previewExpression);
function fixture(usedSide){
 const hero=(id,hp)=>({id,hp,maxHp:100,attack:50,defense:30,shield:0});
 const c=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'seat-usage',energy:[100,100],now:0}),teams:[[hero('a0',100),hero('a1',0)],[hero('b0',100),hero('b1',0)]],commanders:[{commanderId:'support'},{commanderId:'support'}]});
 castLiveCommanderCombat(c,{side:usedSide,ability:'ultimate',targetIds:[usedSide?'b1':'a1'],requestId:'seat_usage_001',matchKey:'seat-usage',now:1000});
 return {...viewLiveCommanderCombat(c),winner:null,commanderEnergy:[...c.abilities.energy],commanderUltimateEnergy:[...c.abilities.ultimateEnergy],abilities:[0,1].map(side=>viewLiveCommanderAbilities(c.abilities,side,7000)),summary:null,commanders:c.commanders,initialShields:[[0,0],[0,0]],log:c.events};
}
for(const usedSide of [0,1])for(const path of ['/live','/preview'])test(`${path} HTTP response orients ultimate/revival usage; authoritative used seat ${usedSide}`,async()=>{
 const current=fixture(usedSide),before=structuredClone(current);
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),side=Number(url.searchParams.get('side'));
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/live')send(200,liveSnapshot({snapshot:()=>current},'seat-usage',{},0,side,s=>s));
  else previewSnapshot(send,{ready:[true,true],result:current},side,s=>s);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(const side of [0,1]){
   const response=await fetch(`http://127.0.0.1:${server.address().port}${path}?side=${side}`);assert.equal(response.status,200);
   const body=await response.json(),snapshot=path==='/live'?body:body.result;
   const expected=side===0?before.ultimateUsed:[...before.ultimateUsed].reverse();
   assert.deepEqual(snapshot.ultimateUsed,expected,`${path} ultimate viewer ${side}`);
   assert.deepEqual(snapshot.revivalUsed,expected,`${path} revival viewer ${side}`);
   assert.equal(snapshot.ultimateUsed[0],usedSide===side,'viewer own Used state');
   assert.equal(snapshot.revivalUsed[0],usedSide===side,'viewer own revival allowance');
   if(path==='/live'){assert.equal(snapshot.ultimateUsed[0],snapshot.abilities[0].ultimateUsed,'flags agree with already-oriented ability state');assert.equal(snapshot.abilities[0].energy,100);assert.equal(snapshot.abilities[0].ultimateEnergy,usedSide===side?10:100);}else{assert.deepEqual(snapshot.commanderEnergy,[100,100]);assert.equal(snapshot.commanderUltimateEnergy[0],usedSide===side?10:100);}
  }
  assert.deepEqual(current,before,'response orientation must not mutate server authority');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
