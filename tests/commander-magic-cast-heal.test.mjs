import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
import {arcaneDamageAttack,transferArcaneSurgeOnDeath} from '../commander-ultimate-status.js';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
const hero=(id,hp=100)=>({id,hp,maxHp:100,attack:50,defense:0,speed:50,shield:0,role:'fighter',lane:'front',position:0});
for(const side of [0,1])for(const hp of [1,60,90,100])test(`selected hero heal seat ${side} hp ${hp}`,()=>{
 const teams=[[hero('chosen',hp),hero('other',40)],[hero('enemy')]];if(side)teams.reverse();
 const before=structuredClone(teams);
 const result=applyLiveCommanderEffect(teams,{side,ability:'ultimate',commanderId:'magic',targetIds:['chosen'],round:2});
 const target=result.teams[side][0];assert.equal(target.hp,Math.min(100,hp+30));assert.equal(result.teams[side][1].hp,40);assert.deepEqual(teams,before);
 for(const round of [2,3,4])assert.equal(arcaneDamageAttack(target,round),100);assert.equal(arcaneDamageAttack(target,5),50);
 const replay=createBattleReplayHealth(teams);
 replay.apply({side:1-side,actor:'enemy',action:'attack',target:'chosen',value:100-hp});
 const event={...result.log.at(-1),eventId:'cast'};assert.equal(replay.apply(event)[side][0],target.hp);assert.equal(replay.apply({...event})[side][0],target.hp);
 const framed=createBattleReplayHealth(teams);assert.equal(framed.apply({...event,hpSnapshot:result.teams.map(t=>t.map(h=>h.hp))})[side][0],target.hp);
});
test('dead targets rejected, no repeated heal on active surge or death transfer',()=>{
 assert.throws(()=>applyLiveCommanderEffect([[hero('chosen',0),hero('other')],[hero('enemy')]],{side:0,ability:'ultimate',commanderId:'magic',targetIds:['chosen']}));
 const result=applyLiveCommanderEffect([[hero('chosen',20),hero('other',40)],[hero('enemy')]],{side:0,ability:'ultimate',commanderId:'magic',targetIds:['chosen']});
 assert.throws(()=>applyLiveCommanderEffect(result.teams,{side:0,ability:'ultimate',commanderId:'magic',targetIds:['chosen']}));
 result.teams[0][0].hp=0;transferArcaneSurgeOnDeath(result.teams[0][0],result.teams[0],1);assert.equal(result.teams[0][1].hp,40);
});
test('duplicate live cast heals exactly once and preserves turn timing',()=>{
 const combat=createLiveCommanderCombat({teams:[[hero('chosen',10)],[hero('enemy')]],round:2,commanders:[{commanderId:'magic'},{commanderId:'magic'}],abilities:createLiveCommanderAbilities({matchKey:'heal',energy:[100,100],now:0})});
 combat.teams[0][0].lastActionRound=2;
 const request={side:0,ability:'ultimate',targetIds:['chosen'],requestId:'heal-cast',matchKey:'heal',now:1000};
 castLiveCommanderCombat(combat,request);castLiveCommanderCombat(combat,request);
 assert.equal(combat.teams[0][0].hp,40);assert.equal(combat.teams[0][0].arcaneSurgeFromRound,3);assert.equal(combat.teams[0][0].arcaneSurgeUntilRound,5);
});
test('historical surge without a heal impact does not heal',()=>{
 const replay=createBattleReplayHealth([[hero('chosen')],[hero('enemy')]]);
 replay.apply({side:1,actor:'enemy',action:'attack',target:'chosen',value:70});
 assert.equal(replay.apply({side:0,action:'commander-magic-ultimate',impacts:[{target:'chosen',kind:'buff',value:50,fromRound:1,untilRound:3}]})[0][0],30);
});
test('heal uses max health rather than attack or missing health and floors fractional HP',()=>{
 const target={...hero('chosen',10),maxHp:103,attack:999,commanderHealingBonus:5};
 const result=applyLiveCommanderEffect([[target],[hero('enemy')]],{side:0,ability:'ultimate',commanderId:'magic',targetIds:['chosen']});
 assert.equal(result.teams[0][0].hp,40);assert.equal(result.log.at(-1).impacts.find(i=>i.kind==='heal').value,30);
});
