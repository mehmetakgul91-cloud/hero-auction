import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {createBasicTurnSession,peekBasicTurn,stepBasicTurn,advanceBasicTurnSession} from '../commander-basic-turn-session.js';
function make(){
 const teams=[[{id:'a',hp:100,maxHp:100,attack:30,defense:0,shield:0,lane:'front',speed:20,position:0}],[{id:'b',hp:100,maxHp:100,attack:30,defense:0,shield:0,lane:'front',speed:10,position:0}]];
 const abilities=createLiveCommanderAbilities({matchKey:'cursor:1',energy:[40,40],now:1000});
 return createLiveCommanderCombat({abilities,teams,commanders:[{commanderId:'defense'},{commanderId:'attack'}]});
}
test('only scheduled hero acts once per round',()=>{
 const s=createBasicTurnSession(make());
 assert.equal(peekBasicTurn(s).actorId,'a');
 stepBasicTurn(s);
 assert.equal(peekBasicTurn(s).actorId,'b');
 stepBasicTurn(s);
 assert.equal(peekBasicTurn(s),null);
 assert.throws(()=>stepBasicTurn(s),/No scheduled hero action/);
 advanceBasicTurnSession(s);
 assert.equal(peekBasicTurn(s).actorId,'a');
});
test('commander shield between hero actions changes subsequent damage',()=>{
 const c=make(),s=createBasicTurnSession(c);
 stepBasicTurn(s);
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'cursor_shield_1',matchKey:'cursor:1',now:2000});
 const shield=c.teams[0][0].shield;
 stepBasicTurn(s);
 assert.equal(c.teams[0][0].hp,100-Math.max(0,30-shield));
});
test('special heroes cannot enter basic-only scheduler',()=>{
 const c=make();c.teams[0][0].active={effect:'heal'};
 assert.throws(()=>createBasicTurnSession(c),/Special hero mechanics/);
});

test('skipping defeated actors never repeats the next living hero',()=>{
 const c=make();
 c.teams[0].push({id:'a2',hp:100,maxHp:100,attack:30,defense:0,shield:0,lane:'front',speed:5,position:1});
 const session=createBasicTurnSession(c);
 assert.equal(peekBasicTurn(session).actorId,'a');
 stepBasicTurn(session);
 c.teams[1][0].hp=0;
 assert.equal(peekBasicTurn(session).actorId,'a2');
 stepBasicTurn(session);
 assert.equal(peekBasicTurn(session),null);
 assert.throws(()=>stepBasicTurn(session),/No scheduled hero action/);
});
test('opt-in parity session calculates legacy damage with server-owned critical',()=>{
 const c=make();
 const session=createBasicTurnSession(c,{parity:true});
 const before=c.teams[1][0].hp;
 const {result}=stepBasicTurn(session);
 assert.ok([21,27].includes(before-c.teams[1][0].hp));
 assert.equal(result.event.rawDamage,before-c.teams[1][0].hp);
 assert.equal(typeof result.event.critical,'boolean');
 assert.equal(peekBasicTurn(session).actorId,'b');
});
