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
 c.teams[1].push({id:'b2',hp:100,maxHp:100,attack:30,defense:0,shield:0,lane:'front',speed:4,position:1});
 const session=createBasicTurnSession(c);
 assert.equal(peekBasicTurn(session).actorId,'a');
 stepBasicTurn(session);
 c.teams[1][0].hp=0;
 assert.equal(peekBasicTurn(session).actorId,'a2');
 stepBasicTurn(session);
 assert.equal(peekBasicTurn(session).actorId,'b2');
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

test('opt-in support heals injured ally on third round instead of attacking',()=>{
 const c=make();c.round=3;
 c.teams[0][0].role='support';c.teams[0][0].attack=100;
 c.teams[0].push({id:'injured',hp:20,maxHp:100,attack:10,defense:0,shield:0,lane:'back',speed:5,position:1});
 const session=createBasicTurnSession(c,{parity:true,specialHealing:true});
 const {result}=stepBasicTurn(session);
 assert.equal(result.event.action,'heal');
 assert.equal(result.event.target,'injured');
 assert.equal(c.teams[0][1].hp,72);
 assert.equal(c.teams[1][0].hp,100);
});
test('opt-in self-heal falls back to ordinary attack when at full HP',()=>{
 const c=make();c.round=3;
 c.teams[0][0].active={effect:'heal'};
 const session=createBasicTurnSession(c,{parity:true,specialHealing:true});
 const {result}=stepBasicTurn(session);
 assert.equal(result.event.action,'attack');
 assert.ok(c.teams[1][0].hp<100);
});
test('unported special effects remain blocked even with healing enabled',()=>{
 const c=make();c.teams[0][0].active={effect:'splash'};
 assert.throws(()=>createBasicTurnSession(c,{parity:true,specialHealing:true}),/Special hero mechanics/);
});

test('opt-in energy splash applies primary and secondary damage in one scheduled turn',()=>{
 const c=make();c.round=3;
 c.teams[0][0].role='energy';
 c.teams[1].push({id:'b2',hp:100,maxHp:100,attack:30,defense:0,shield:10,lane:'back',speed:5,position:1});
 const s=createBasicTurnSession(c,{parity:true,energySplash:true});
 const {result}=stepBasicTurn(s);
 assert.equal(result.events.length,2);
 assert.equal(c.version,1);
 assert.equal(peekBasicTurn(s).actorId,'b');
 assert.equal(c.teams[1].filter(u=>u.hp<100).length,1);
 assert.equal(c.teams[1][1].hp,100);
 assert.equal(c.teams[1][1].shield,10-result.events.find(e=>e.action==='splash').rawDamage);
});
test('energy splash is inactive on ordinary rounds',()=>{
 const c=make();c.teams[0][0].role='energy';
 const s=createBasicTurnSession(c,{parity:true,energySplash:true});
 const {result}=stepBasicTurn(s);
 assert.equal(result.event.action,'attack');
});

test('scheduled shield special applies only on third round',()=>{
 const c=make();c.round=3;c.teams[0][0].active={effect:'shield',name:'Guard'};
 const s=createBasicTurnSession(c,{parity:true,shieldDrain:true});
 const {result}=stepBasicTurn(s);
 assert.equal(result.events.some(e=>e.action==='shield'),true);
 assert.equal(c.teams[0][0].shield,Math.round(c.teams[0][0].defense*.4));
 assert.equal(peekBasicTurn(s).actorId,'b');
});
test('scheduled drain special heals based on actual damage',()=>{
 const c=make();c.round=3;c.teams[0][0].active={effect:'drain',name:'Drain'};c.teams[0][0].hp=70;
 const s=createBasicTurnSession(c,{parity:true,shieldDrain:true});
 const {result}=stepBasicTurn(s);
 assert.equal(result.events.some(e=>e.action==='heal'),true);
 assert.ok(c.teams[0][0].hp>70);
});
test('shield skill attacks normally outside special rounds',()=>{
 const c=make();c.teams[0][0].active={effect:'shield'};
 const s=createBasicTurnSession(c,{parity:true,shieldDrain:true});
 const {result}=stepBasicTurn(s);
 assert.equal(result.event.action,'attack');
 assert.equal(c.teams[0][0].shield,0);
});

for(const [effect,action] of [['sunder','armor-break'],['weaken','weaken'],['haste','haste']]){
 test('scheduled '+effect+' special updates stats on third round',()=>{
  const c=make();c.round=3;c.teams[0][0].active={effect,name:effect};
  const original={defense:c.teams[1][0].defense,attack:c.teams[1][0].attack,speed:c.teams[0][0].speed};
  const session=createBasicTurnSession(c,{parity:true,statSpecial:true});
  const {result}=stepBasicTurn(session);
  assert.equal(result.events[0].action,action);
  assert.equal(result.events.length,2);
  assert.equal(c.version,1);
  if(effect==='sunder')assert.equal(c.teams[1][0].defense,Math.max(5,Math.floor(original.defense*.85)));
  if(effect==='weaken')assert.equal(c.teams[1][0].attack,Math.max(5,Math.floor(original.attack*.9)));
  if(effect==='haste')assert.equal(c.teams[0][0].speed,Math.min(150,original.speed+8));
 });
}
test('stat special actor uses ordinary attack on non-special round',()=>{
 const c=make();c.teams[0][0].active={effect:'weaken'};
 const session=createBasicTurnSession(c,{parity:true,statSpecial:true});
 assert.equal(stepBasicTurn(session).result.event.action,'attack');
});
