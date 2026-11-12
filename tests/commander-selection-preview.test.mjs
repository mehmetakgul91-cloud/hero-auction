import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderSelectionPreview} from '../commander-selection-preview.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {COMMANDERS,commanderStatBonus} from '../arena-commanders.js';
import {battleRoster} from '../battle-roster.js';
import {commanderOriginalRoster} from '../commander-original-roster.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {commanderAbilityStats} from '../public/commander-ability-rules.js';

import {heroHealingRate,calculateSpecialHeal} from '../battle-special-formulas.js';
const stats=['attack','defense','maxHp','speed','healingPower'];
const levels={attack:40,defense:40,magic:40,support:40};
const profile={commanderId:'support',levels};
const cards=heroes=>heroes.map((hero,index)=>({id:hero.id,role:hero.role,power:60+index*7,lane:index<2?'front':'back'}));
const heavy=role=>cards([...battleRoster.filter(hero=>hero.role===role).slice(0,4),battleRoster.find(hero=>hero.role==='tank')]);
const mixed=()=>cards(['fighter','assassin','tank','energy','support'].map(role=>battleRoster.find(hero=>hero.role===role)));
const view=hero=>{const {id,name,role,lane,power,attack,defense,maxHp,speed}=hero;return {id,name,role,lane,power,attack,defense,maxHp,speed,healingRate:Number((heroHealingRate(hero)*100).toFixed(6)),healingPower:role==='support'?calculateSpecialHeal({attack,missingHp:Number.MAX_SAFE_INTEGER,skill:hero.active,healingBonus:hero.commanderHealingBonus||0}):0};};
const freeze=value=>{Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return value;};
function assertParity(a,b,options){
 const preview=commanderSelectionPreview(a,b,options);
 const base=prepareLiveArenaTeams(a,b,{remainingCredits:options.remainingCredits,cardAdapter:'auction'})[options.seat];
 assert.deepEqual(preview.baseline.heroes,base.map(view));
 assert.deepEqual(preview.options.map(option=>option.commanderId),COMMANDERS.map(c=>c.id));
 for(const option of preview.options){
  const commanders=[null,null];commanders[options.seat]=option.profile;
  const actual=prepareLiveArenaTeams(a,b,{remainingCredits:options.remainingCredits,commanders,cardAdapter:'auction'})[options.seat];
  assert.deepEqual(option.heroes.map(({delta,...hero})=>hero),actual.map(view));
  for(const [index,hero] of option.heroes.entries())for(const key of stats)assert.equal(hero.delta[key],view(actual[index])[key]-view(base[index])[key]);
  for(const key of [...stats,'cardPower']){
   const field=key==='cardPower'?'power':key;
   const sum=actual.map(view).reduce((n,hero)=>n+hero[field],0),baseSum=base.map(view).reduce((n,hero)=>n+hero[field],0);
   assert.equal(option.totals[key],sum);assert.equal(preview.baseline.totals[key],baseSum);assert.equal(option.delta[key],sum-baseSum);
  }
 }
 return preview;
}

for(const role of ['energy','fighter'])for(const seat of [0,1])test(`${role}-heavy seat ${seat} previews match actual prepared combat for all commanders`,()=>{
 const a=seat===0?heavy(role):mixed(),b=seat===1?heavy(role):mixed();
 const result=assertParity(a,b,{seat,remainingCredits:[7,-4],profile});
 const specialty=result.options.find(option=>option.commanderId===(role==='energy'?'magic':'attack'));
 const other=result.options.find(option=>option.commanderId==='defense');
 assert.ok(specialty.totals.attack>other.totals.attack);
});

test('preserves earned levels and activates only the selected specialty',()=>{
 const result=assertParity(mixed(),mixed(),{seat:0,profile});
 for(const option of result.options){
  assert.deepEqual(option.profile.levels,levels);
  for(const stat of Object.keys(levels))assert.equal(commanderStatBonus(option.profile,stat),stat===option.commanderId ? .2 : 0);
 }
 // Returning to the original commander restores its stored specialty effect.
 const switched={commanderId:'attack',levels:{attack:34,defense:8,magic:37,support:6}};
 const first=commanderSelectionPreview(mixed(),mixed(),{seat:0,profile:switched});
 const magic=first.options.find(option=>option.commanderId==='magic');
 const returned=commanderSelectionPreview(mixed(),mixed(),{seat:0,profile:magic.profile});
 assert.deepEqual(returned.options,first.options);
 assert.equal(magic.profile.levels.magic,37);assert.equal(magic.profile.levels.attack,34);
});

test('no account has zero-level options and zero starting-stat deltas',()=>{
 const result=assertParity(mixed(),heavy('energy'),{seat:1,remainingCredits:[12,3],profile:null});
 for(const option of result.options){
  assert.deepEqual(option.profile.levels,{attack:0,defense:0,magic:0,support:0});
  assert.deepEqual(option.totals,result.baseline.totals);
  assert.ok(Object.values(option.delta).every(value=>value===0));
 }
});

test('credits, changed lanes and confirmed reorder use the same engine without mutation',()=>{
 const a=freeze(mixed().reverse().map((card,index)=>({...card,lane:index%2?'back':'front'})));
 const b=freeze(cards(commanderOriginalRoster.slice(-5)).reverse());
 const options=freeze({seat:0,remainingCredits:[19,-2],profile:structuredClone(profile)});
 const before=JSON.stringify({a,b,options});
 const result=assertParity(a,b,options);
 assert.equal(JSON.stringify({a,b,options}),before);
 assert.deepEqual(result.baseline.heroes.map(hero=>hero.id),a.map(card=>card.id));
 assert.deepEqual(result.baseline.heroes.map(hero=>hero.lane),a.map(card=>card.lane));
 const noCredits=commanderSelectionPreview(a,b,{...options,remainingCredits:[0,-2]});
 assert.ok(result.baseline.totals.attack>noCredits.baseline.totals.attack);
});

test('starting passive effects are included and opponent commanders cannot affect own initial stats',()=>{
 const passiveHeroes=battleRoster.filter(hero=>['guard','resist','focus','evasion','momentum'].includes(hero.passive?.effect)).slice(0,5);
 assert.equal(passiveHeroes.length,5);
 const a=cards(passiveHeroes),b=mixed();
 const result=assertParity(a,b,{seat:0,profile});
 for(const option of result.options)for(const {id} of COMMANDERS){
  const actual=prepareLiveArenaTeams(a,b,{commanders:[option.profile,{commanderId:id,levels}],cardAdapter:'auction'})[0];
  assert.deepEqual(option.heroes.map(({delta,...hero})=>hero),actual.map(view));
 }
});

test('preview rejects invalid seat, profile, cards and credits',()=>{
 const a=mixed();
 for(const seat of [-1,2,'0',undefined])assert.throws(()=>commanderSelectionPreview(a,a,{seat}),/seat/);
 assert.throws(()=>commanderSelectionPreview(a,a,{seat:0,profile:{commanderId:'attack',levels:{...levels,magic:41}}}),/seviyesi/);
 assert.throws(()=>commanderSelectionPreview(a.slice(1),a,{seat:0}),/five cards/);
 assert.throws(()=>commanderSelectionPreview(a,a,{seat:0,remainingCredits:[1.5,0]}),/credits/);
});

// This deliberately uses unequal levels: switching must not borrow support's
// level 40 for attack abilities or destroy it while the support branch is inactive.
const retainedLevels={attack:12,defense:7,magic:9,support:40};
function supportRoundTrip(a,b,seat=0){
 const initial={commanderId:'support',levels:{...retainedLevels}};
 const first=assertParity(a,b,{seat,profile:initial});
 const support=first.options.find(option=>option.commanderId==='support');
 const attack=first.options.find(option=>option.commanderId==='attack');
 const afterSwitch=assertParity(a,b,{seat,profile:attack.profile});
 const restored=afterSwitch.options.find(option=>option.commanderId==='support');
 const afterReturn=assertParity(a,b,{seat,profile:restored.profile});
 assert.deepEqual(afterReturn.options,first.options);
 for(const option of [support,attack,restored])assert.deepEqual(option.profile.levels,retainedLevels);
 return {baseline:first.baseline,support,attack,restored};
}

for(const seat of [0,1])test(`support 40 → attack → support restores actual support healing and preview at seat ${seat}`,()=>{
 const {baseline,support,attack,restored}=supportRoundTrip(mixed(),mixed(),seat);
 const healerIndex=baseline.heroes.findIndex(hero=>hero.role==='support');
 assert.ok(healerIndex>=0);
 const base=baseline.heroes[healerIndex];
 assert.equal(support.heroes[healerIndex].maxHp,base.maxHp);
 assert.equal(support.heroes[healerIndex].attack,base.attack);
 assert.equal(support.heroes[healerIndex].healingRate,base.healingRate+20);
 assert.equal(attack.heroes[healerIndex].maxHp,base.maxHp);
 assert.ok(support.heroes[healerIndex].healingPower>attack.heroes[healerIndex].healingPower);
 assert.deepEqual(restored.heroes,support.heroes);
 // All off-specialty levels are inactive, regardless of stored level.
 const commanders=[null,null];
 commanders[seat]={...attack.profile,levels:{...retainedLevels,support:20}};
 const capped=prepareLiveArenaTeams(mixed(),mixed(),{commanders,cardAdapter:'auction'})[seat];
 assert.deepEqual(capped.map(view),attack.heroes.map(({delta,...hero})=>hero));
});

test('round-trip selected profiles drive live attack versus healing abilities, not the previously selected specialty',()=>{
 const a=mixed(),b=mixed();
 const {support,attack,restored}=supportRoundTrip(a,b);
 for(const option of [support,attack,restored]){
  const selected=option.profile;
  const commanders=[selected,{commanderId:'defense',levels:{attack:0,defense:0,magic:0,support:0}}];
  const teams=prepareLiveArenaTeams(a,b,{commanders,cardAdapter:'auction'});
  teams[0][0].hp=Math.floor(teams[0][0].maxHp/2);
  const abilities=createLiveCommanderAbilities({matchKey:'retained-levels',energy:[100,100],now:0});
  const combat=createLiveCommanderCombat({abilities,teams,commanders});
  const startingTeams=structuredClone(combat.teams);
  assert.equal(combat.abilities.commanderIds[0],selected.commanderId);
  const stats=commanderAbilityStats(selected);
  assert.equal(stats.level,selected.commanderId==='support'?40:12);
  assert.equal(stats.normalRate,selected.commanderId==='support'?.05:.10);
  assert.equal(stats.normalBase,stats.level);
  const result=castLiveCommanderCombat(combat,{side:0,ability:'normal',requestId:'retention-normal',matchKey:'retained-levels',now:0});
  const event=result.events.at(-1);
  assert.equal(event.action,`commander-${selected.commanderId}-normal`);
  assert.equal(event.commanderLevel,stats.level);
  if(selected.commanderId==='support'){
   assert.ok(result.teams[0][0].hp>teams[0][0].hp);
   assert.deepEqual(result.teams[1],startingTeams[1]);
   assert.ok(event.impacts.length>0&&event.impacts.every(impact=>impact.kind==='heal'));
  }else{
   assert.deepEqual(result.teams[0],startingTeams[0]);
   assert.ok(result.teams[1].some((hero,index)=>hero.hp<teams[1][index].hp));
   assert.ok(event.impacts.length>0&&event.impacts.every(impact=>impact.kind==='damage'));
  }
  assert.deepEqual(selected.levels,retainedLevels);
 }
});
