import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBotCast} from '../bot-strategy.js';
import {getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
const unit=(id,extra={})=>({id,hp:100,maxHp:100,attack:100,defense:20,shield:0,power:80,role:'fighter',...extra});
const options={now:10000,startedAt:0,lastCastAt:0};
const snapshot=()=>({round:3,finished:false,revivalUsed:[false,false],teams:[[unit('enemy')],[unit('ally-a'),unit('ally-mage',{role:'energy'}),unit('fallen',{hp:0,power:90,maxHp:180})]],abilities:[{}, {energy:100,canUseNormal:true,canUseUltimate:true}]});
test('mage chooses one highest-attack eligible ally, energy role wins tie; no snapshot mutation',()=>{
 const s=snapshot(),before=structuredClone(s);assert.deepEqual(chooseBotCast(s,'magic','hard',options),{ability:'ultimate',targetIds:['ally-mage']});assert.deepEqual(s,before);
 s.teams[1][0].attack=120;assert.deepEqual(chooseBotCast(s,'magic','medium',options),{ability:'ultimate',targetIds:['ally-a']});
 s.teams[1][0].arcaneSurgeUntilRound=3;assert.deepEqual(chooseBotCast(s,'magic','hard',options),{ability:'ultimate',targetIds:['ally-mage']});
 s.teams[1][1].arcaneSurgeUntilRound=5;assert.deepEqual(chooseBotCast(s,'magic','hard',options),{ability:'normal',targetIds:['enemy']});
 s.teams[0][0].commanderWeaken=.3;s.teams[0][0].commanderWeakenUntilRound=5;assert.equal(chooseBotCast(s,'magic','hard',options),null);
 s.teams[1][0].arcaneSurgeUntilRound=2;assert.deepEqual(chooseBotCast(s,'magic','hard',options),{ability:'ultimate',targetIds:['ally-a']});
});
test('revival chooses one dead ally by visible power then maxHP and stable ID, even with living team full',()=>{
 const s=snapshot();s.teams[1].push(unit('fallen-b',{hp:0,power:90,maxHp:220}),unit('fallen-z',{hp:0,power:85,maxHp:500}));
 assert.deepEqual(chooseBotCast(s,'support','hard',options),{ability:'ultimate',targetIds:['fallen-b']});
 s.teams[1].push(unit('fallen-a',{hp:0,power:90,maxHp:220}));assert.deepEqual(chooseBotCast(s,'support','medium',options),{ability:'ultimate',targetIds:['fallen-a']});
});
test('used or impossible revival falls back to legal normal heal or waits, never wastes ultimate',()=>{
 const s=snapshot();s.revivalUsed[1]=true;assert.equal(chooseBotCast(s,'support','hard',options),null);
 s.teams[1][0].hp=20;assert.deepEqual(chooseBotCast(s,'support','hard',options),{ability:'normal'});
 s.revivalUsed[1]=false;s.teams[1]=s.teams[1].filter(u=>u.hp>0);assert.deepEqual(chooseBotCast(s,'support','medium',options),{ability:'normal'});
 s.teams[1][0].hp=100;assert.equal(chooseBotCast(s,'support','medium',options),null);
});
test('active attack focus prevents waste; expired or dead-target marks do not',()=>{
 const s=snapshot();s.teams[1][0].commanderFocusTargetId='enemy';s.teams[1][0].commanderFocusUntilRound=3;
 assert.equal(chooseBotCast(s,'attack','hard',options),null);s.teams[1][0].commanderFocusUntilRound=2;assert.deepEqual(chooseBotCast(s,'attack','hard',options),{ability:'ultimate'});
 s.teams[1][0].commanderFocusUntilRound=5;s.teams[1][0].commanderFocusTargetId='already-dead';assert.deepEqual(chooseBotCast(s,'attack','hard',options),{ability:'ultimate'});
});
test('active last stand does not invalidate useful defense shielding',()=>{
 const s=snapshot();s.teams[1][0].lastStandReady=true;s.teams[1][0].lastStandUntilRound=4;assert.deepEqual(chooseBotCast(s,'defense','hard',options),{ability:'ultimate'});
});
test('uses shared per-archetype costs and authoritative cast flags rather than hardcoded100',()=>{
 for(const id of ['attack','defense','magic','support']){
  const s=snapshot();s.abilities[1].energy=getCommanderAbilityCost(id,'ultimate');const c=chooseBotCast(s,id,'medium',options);assert.equal(c?.ability,'ultimate',id);
  s.abilities[1].energy--;assert.notEqual(chooseBotCast(s,id,'medium',options)?.ability,'ultimate',id+' insufficient budget');
  s.abilities[1].energy=100;s.abilities[1].canUseUltimate=false;assert.notEqual(chooseBotCast(s,id,'medium',options)?.ability,'ultimate');
  s.abilities[1].canUseNormal=false;assert.equal(chooseBotCast(s,id,'medium',options),null);
 }
});
test('same choices work on either seat, using only public snapshot state',()=>{
 const s=snapshot();const old=s.teams;s.teams=[old[1],old[0]];s.abilities=[s.abilities[1],{}];assert.deepEqual(chooseBotCast(s,'magic','hard',{...options,side:0}),{ability:'ultimate',targetIds:['ally-mage']});assert.deepEqual(chooseBotCast(s,'support','hard',{...options,side:0}),{ability:'ultimate',targetIds:['fallen']});
});
for(const commanderId of ['magic','support'])test('chosen '+commanderId+' ultimate passes actual live authority and charges correct cost once',()=>{
 const s=snapshot();const c=createLiveCommanderCombat({round:3,teams:s.teams,abilities:createLiveCommanderAbilities({matchKey:'bot:newult',energy:[100,100],now:0}),commanders:[{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},{commanderId,levels:{attack:0,defense:0,magic:0,support:0}}]});
 const view={...c,abilities:[{},viewLiveCommanderAbilities(c.abilities,1,10000)]};const choice=chooseBotCast(view,commanderId,'hard',options);const cast={side:1,...choice,requestId:'bot-valid-ultimate',matchKey:'bot:newult',now:10000};
 castLiveCommanderCombat(c,cast);assert.equal(c.abilities.energy[1],100-getCommanderAbilityCost(commanderId,'ultimate'));const state=structuredClone(c.teams);assert.equal(castLiveCommanderCombat(c,cast).duplicate,true);assert.deepEqual(c.teams,state);
 if(commanderId==='magic')assert.equal(c.teams[1].find(u=>u.id==='ally-mage').arcaneSurgeBonusAttack,100);else{assert.equal(c.teams[1].find(u=>u.id==='fallen').hp,72);assert.equal(c.revivalUsed[1],true);}
});
