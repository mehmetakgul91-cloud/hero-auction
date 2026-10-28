import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBotCommander,chooseBotBid,chooseBotFormation,chooseBotCast,BOT_REACTION_MS} from '../bot-strategy.js';
import {battleRoster} from '../battle-roster.js';
import {getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,beginServerCombatRound} from '../commander-live-combat.js';
const unit=(id,props={})=>({id,hp:100,maxHp:100,attack:100,shield:0,...props});
const state=(props={})=>({finished:false,round:2,teams:[[unit('enemy-a'),unit('enemy-b',{attack:180})],[unit('ally')]],abilities:[{}, {energy:60,canUseNormal:true,canUseUltimate:false}],...props});
const options={now:10000,startedAt:0,lastCastAt:0};

test('commander varies with default medium upgrades and can select each of the four archetypes',()=>{
 const ids=new Set();let previous;
 for(let i=0;i<16;i++){
  const p=chooseBotCommander(previous,()=>i%4/4);
  assert.notEqual(p.commanderId,previous);assert.deepEqual(p.levels,{attack:10,defense:10,magic:10,support:10});
  previous=p.commanderId;ids.add(previous);
 }
 assert.equal(ids.size,4);
});

test('auction is blind to exact power and future deck, obeys equal credits and roster cap',()=>{
 const input={difficulty:'hard',card:{name:'Unknown',rarity:'rare'},bot:{credits:20,team:[]},human:{credits:20,team:[]},round:0,topBid:3};
 const expected=chooseBotBid(input);
 assert.equal(expected,true);
 assert.equal(chooseBotBid({...input,card:{...input.card,power:1},cards:[{power:100}]}),expected);
 assert.equal(chooseBotBid({...input,card:{...input.card,power:100},cards:[{power:1}]}),expected);
 assert.equal(chooseBotBid({...input,bot:{credits:3,team:[]}}),false);
 assert.equal(chooseBotBid({...input,bot:{credits:20,team:Array(5).fill({})}}),false);
 assert.equal(chooseBotBid({...input,difficulty:'easy'},()=>0),false);
 assert.equal(chooseBotBid({...input,difficulty:'medium'},()=>.9),false);
});

test('hard auction uses visible team gaps and preserves purchase reserves',()=>{
 const tank=battleRoster.find(h=>h.role==='tank');
 const input={difficulty:'hard',card:{name:tank.name,rarity:'advanced'},bot:{credits:20,team:[]},human:{credits:20,team:[]},topBid:3};
 assert.equal(chooseBotBid(input),true);
 assert.equal(chooseBotBid({...input,bot:{credits:20,team:[tank,tank]}}),false);
 assert.equal(chooseBotBid({...input,bot:{credits:10,team:[]}}),false);
});

test('formation preserves acquired heroes and intrinsic roles; hard protects fragile backline',()=>{
 const cards=['energy','support','tank','fighter','assassin'].map(role=>battleRoster.find(h=>h.role===role));
 for(const level of ['easy','medium','hard']){
  const f=chooseBotFormation(cards,level,()=>.3);
  assert.deepEqual([...f.positions].sort(),[0,1,2,3,4]);
  assert.equal(f.lanes.length,5);
  f.positions.forEach((p,i)=>assert.equal(f.roles[i],cards[p].role));
 }
 const hard=chooseBotFormation(cards,'hard');
 assert.equal(hard.lanes[hard.positions.indexOf(2)],'front');
 assert.equal(hard.lanes[hard.positions.indexOf(0)],'back');
 assert.equal(hard.lanes[hard.positions.indexOf(1)],'back');
});

test('difficulty has measurable reaction timing and respects cooldown, effect lock and finished state',()=>{
 for(const level of ['easy','medium','hard']){
  assert.equal(chooseBotCast(state(),'magic',level,{now:BOT_REACTION_MS[level]-1}),null);
  assert.ok(chooseBotCast(state(),'magic',level,{now:BOT_REACTION_MS[level]}));
 }
 assert.equal(chooseBotCast(state({finished:true}),'magic','hard',options),null);
 assert.equal(chooseBotCast(state({abilities:[{}, {energy:100,canUseNormal:false,canUseUltimate:false}]}),'magic','hard',options),null);
});

test('hard spends useful normal energy without draining ultimate charge',()=>{
 assert.deepEqual(chooseBotCast(state(),'attack','hard',options),{ability:'normal'});
 assert.deepEqual(chooseBotCast(state(),'attack','medium',options),{ability:'normal'});
 const s=state();s.teams[0][0].hp=2;
 assert.deepEqual(chooseBotCast(s,'attack','hard',options),{ability:'normal'});
 s.abilities[1].canUseUltimate=true;s.abilities[1].energy=100;
 assert.deepEqual(chooseBotCast(s,'attack','hard',options),{ability:'ultimate',targetIds:['enemy-a']});
 assert.deepEqual(chooseBotCast(s,'attack','easy',options),{ability:'normal'});
});

test('hard healing waits for damage and emergency beats energy saving; shield avoids waste',()=>{
 const s=state();
 assert.equal(chooseBotCast(s,'support','hard',options),null);
 s.teams[1][0].hp=20;
 assert.deepEqual(chooseBotCast(s,'support','hard',options),{ability:'normal'});
 s.teams[1][0].hp=100;s.teams[1][0].shield=100;
 s.abilities[1].canUseUltimate=true;s.abilities[1].energy=getCommanderAbilityCost('defense','ultimate');
 assert.equal(chooseBotCast(s,'defense','hard',options),null);
 s.teams[1][0].shield=0;
 assert.deepEqual(chooseBotCast(s,'defense','hard',options),{ability:'ultimate',targetIds:['ally']});
});

test('hard magic targets strongest unstunned enemy and executes legally in live combat',()=>{
 const s=state();
 assert.deepEqual(chooseBotCast(s,'magic','hard',options),{ability:'normal',targetIds:['enemy-b']});
 s.teams[0][1].commanderStunNextAttack=true;
 const choice=chooseBotCast(s,'magic','hard',options);
 assert.deepEqual(choice,{ability:'normal',targetIds:['enemy-a']});
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'test',energy:[60,60],now:0}),teams:s.teams,commanders:[chooseBotCommander(undefined,()=>0),{commanderId:'magic',levels:{attack:0,defense:0,magic:0,support:0}}]});
 castLiveCommanderCombat(combat,{side:1,...choice,requestId:'bot-test-1',matchKey:'test',now:10000});
 assert.equal(combat.teams[0][0].commanderStunNextAttack,true);assert.equal(combat.teams[0][0].commanderWeaken,undefined);
 assert.equal(combat.abilities.energy[1],20);
 assert.equal(combat.abilities.cooldownUntil[1],15000);
});

test('ultimate magic selects exactly one living friendly hero, never enemy targets',()=>{
 const s=state();s.abilities[1].canUseUltimate=true;s.abilities[1].energy=100;
 assert.deepEqual(chooseBotCast(s,'magic','hard',options),{ability:'ultimate',targetIds:['ally']});
 s.teams[0][0].hp=0;
 assert.deepEqual(chooseBotCast(s,'magic','hard',options),{ability:'ultimate',targetIds:['ally']});
});


test('hard magic uses an opening debuff then really accumulates round energy to an ultimate',()=>{
 const commanders=[chooseBotCommander(undefined,()=>0),{commanderId:'magic',levels:{attack:0,defense:0,magic:0,support:0}}];
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'saving',now:0}),teams:state().teams,commanders});
 let lastCastAt=0;const casts=[],castRounds=[];
 for(let round=2;round<=11;round++){
  beginServerCombatRound(combat,round);
  const now=round*10000;
  const snapshot={...combat,abilities:[{},viewLiveCommanderAbilities(combat.abilities,1,now)]};
  const choice=chooseBotCast(snapshot,'magic','hard',{now,lastCastAt});
  if(choice){
   castLiveCommanderCombat(combat,{side:1,...choice,requestId:'saving-'+round,matchKey:'saving',now});
   casts.push(choice.ability);castRounds.push(round);lastCastAt=now;
  }
 }
 assert.equal(casts.filter(x=>x==='ultimate').length,1);
 assert.equal(castRounds[casts.indexOf('ultimate')],7);
 assert.ok(casts.filter(x=>x==='normal').length>=2);
 assert.equal(combat.abilities.ultimateEnergy[1],0);
});

test('hard magic uses useful normal debuffs without saving normal energy for ultimate',()=>{
 const s=state({round:6});
 assert.deepEqual(chooseBotCast(s,'magic','hard',{...options,lastCastAt:1000}),{ability:'normal',targetIds:['enemy-b']});
 s.teams[0][1].attack=250;
 assert.deepEqual(chooseBotCast(s,'magic','hard',{...options,lastCastAt:1000}),{ability:'normal',targetIds:['enemy-b']});
});

test('hard normal attacks stay useful against shields without starving ultimate charge',()=>{
 const s=state();s.teams[0][0].shield=10000;s.teams[0][0].hp=2;
 // 100 base attack / 2 targets * 12% = 6 raw; 4 shield + 2 HP.
 assert.deepEqual(chooseBotCast(s,'attack','hard',options),{ability:'normal'});
 s.teams[0][0].hp=3;
 assert.deepEqual(chooseBotCast(s,'attack','hard',options),{ability:'normal'});
});
