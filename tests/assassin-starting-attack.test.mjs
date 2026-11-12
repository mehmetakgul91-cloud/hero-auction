import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAssassinStartingAttackBonus} from '../battle-assassin-attack.js';
import {battleRoster,battleCard} from '../battle-roster.js';
import {fighterFromCard,simulateBattle} from '../battle-engine.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,beginServerCombatRound,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {applyHeroDamage} from '../battle-hp-damage.js';
import {reviveCommanderAlly} from '../commander-ultimate-status.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {commanderSelectionPreview} from '../commander-selection-preview.js';
import {swapSameLaneHeroes,preparationCenterSlot} from '../public/preparation-formation.js';

const assassins=battleRoster.filter(hero=>hero.role==='assassin');
const otherRoles=['tank','fighter','energy','support'].map(role=>battleRoster.find(hero=>hero.role===role));
const levels={attack:31,defense:14,magic:23,support:17};
const cards=(assassin,lane='back')=>[assassin,...otherRoles].map((hero,i)=>({id:hero.id,power:73,lane:i===0?lane:i===1?'front':'back'}));

// Independent oracle for the existing start sequence. This test intentionally
// does not call fighterFromCard, commander support, or the new bonus helper.
function expectedStart(hero,lane,credit,commander){
 const power=73,multiplier=1+hero.laneModifiers[lane],credits=1+credit/100;
 const out={power:Math.round(power*credits*100)/100,attack:Math.round(Math.round(power*multiplier)*credits),defense:Math.round(Math.round(power*multiplier)*credits),maxHp:Math.round(Math.round(power*2*multiplier)*credits),speed:Math.round(Math.round(power*multiplier)*credits)};
 if(commander){
  const stat=hero.role==='tank'?'defense':hero.role==='energy'?'magic':hero.role==='support'?'support':'attack';
  const rate=commander.commanderId===stat?Math.min(commander.levels[stat],40)*.005:0;
  if(hero.role==='tank')out.defense=Number((out.defense*(1+rate)).toFixed(6));
  else if(hero.role==='support'){} // Healing-rate bonus does not change these stats.
  else if(hero.role==='energy')out.attack=Number((out.attack*(1+rate)).toFixed(6));
  else out.attack=Number((out.attack*(1+rate)).toFixed(6));
 }
 const passive=hero.passive;
 if(passive?.effect==='guard'||passive?.effect==='resist')out.defense=Math.round(out.defense*(1+passive.value));
 if(passive?.effect==='focus')out.attack=Math.round(out.attack*(1+passive.value));
 if(passive?.effect==='evasion'||passive?.effect==='momentum')out.speed=Math.round(out.speed*(1+passive.value));
 if(hero.role==='assassin')out.attack=Math.round(out.attack*11/10);
 out.hp=out.maxHp;return out;
}

test('ten percent changes only assassin attack, with whole-point rounding and no per-hit multiplier',()=>{
 for(const attack of [0,1,5,10,25,73,105,137]){
  const units=['assassin','fighter','tank','energy','support'].map(role=>({id:role,role,attack,power:73,defense:81,maxHp:146,hp:146,speed:95,active:{effect:'burst',power:1.2}}));
  const before=structuredClone(units);assert.equal(applyAssassinStartingAttackBonus(units),units);
  for(let i=0;i<units.length;i++)assert.deepEqual(units[i],{...before[i],attack:i===0?Math.round(attack*11/10):attack});
 }
});

for(const assassin of assassins)test(`${assassin.name}: bonus follows lane, credits, commander and passives in both adapters, with no other stat changes`,()=>{
 for(const cardAdapter of ['original','auction'])for(const lane of ['front','back'])for(const credit of [-20,0,17])for(const commander of [null,{commanderId:'attack',levels},{commanderId:'support',levels}]){
  const input=cards(assassin,lane),before=structuredClone(input),prepared=prepareLiveArenaTeams(input,input,{remainingCredits:[credit,credit],commanders:[commander,commander],cardAdapter});
  assert.deepEqual(input,before);
  for(const side of [0,1])for(let i=0;i<input.length;i++){
   const hero=battleRoster.find(h=>h.id===input[i].id),expected=expectedStart(hero,input[i].lane,credit,commander);
   if(lane==='front'&&i===3)expected.defense=Math.round(expected.defense*1.15);
   for(const [stat,value] of Object.entries(expected))assert.equal(prepared[side][i][stat],value,`${hero.name} ${lane} ${credit} ${commander?.commanderId} ${stat}`);
   assert.deepEqual(prepared[side][i].active,hero.active);assert.deepEqual(prepared[side][i].passive,hero.passive);
  }
 }
});

test('live preparation and legacy simulation agree on all starting attack/defense/HP/speed/power values',()=>{
 for(const assassin of assassins)for(const lane of ['front','back']){
  const input=cards(assassin,lane).map(battleCard),commanders=[{commanderId:'attack',levels},{commanderId:'magic',levels}];
  const options={commanders,remainingCredits:[17,-20]},live=prepareLiveArenaTeams(input,input,{...options,cardAdapter:'auction'});
  const simulated=simulateBattle(input,input,{...options,seed:'assassin-start:'+assassin.id+lane,maxRounds:1});
  // No active specials or rage thresholds in this single-round fixture; compare
  // starting stat fields, not HP/damage which have already advanced in simulation.
  for(const side of [0,1])for(let i=0;i<5;i++)for(const stat of ['attack','defense','maxHp','speed','power'])assert.equal(simulated.teams[side][i][stat],live[side][i][stat],`${assassin.name} ${stat}`);
 }
});

test('preview includes the same boosted attack and keeps card power and selected formation identity intact',()=>{
 const input=cards(assassins[0]),profile={commanderId:'support',levels};
 const preview=commanderSelectionPreview(input,input,{seat:0,profile,remainingCredits:[17,0]});
 for(const option of preview.options){
  const prepared=prepareLiveArenaTeams(input,input,{commanders:[option.profile,null],remainingCredits:[17,0],cardAdapter:'auction'})[0];
  assert.deepEqual(option.heroes.map(h=>h.id),input.map(c=>c.id));
  assert.equal(option.heroes[0].attack,expectedStart(assassins[0],'back',17,option.profile).attack);
  assert.equal(option.heroes[0].attack,prepared[0].attack);assert.equal(option.heroes[0].power,85.41);
  assert.equal(option.totals.cardPower,preview.baseline.totals.cardPower);
 }
 assert.equal(preview.baseline.heroes[0].attack,expectedStart(assassins[0],'back',17,null).attack);
});

test('raw old snapshots retain their prior attack through load, rounds, death and revival; new snapshots never compound the bonus',()=>{
 const input=cards(assassins[0]);
 const prior=input.map((card,i)=>fighterFromCard(battleCard(card),i));
 const current=prepareLiveArenaTeams(input,input,{cardAdapter:'auction'})[0];
 for(const units of [prior,current]){
  const saved=JSON.parse(JSON.stringify(units)),attack=saved[0].attack;
  // This is an explicit historical snapshot load, not a newly started battle.
  const combat=createLiveCommanderCombat({heroActionClockVersion:0,teams:[saved,structuredClone(saved)],commanders:[{commanderId:'attack'},{commanderId:'support'}],abilities:createLiveCommanderAbilities({matchKey:'snapshot:test'}),round:1});
  assert.deepEqual(combat.teams[0],saved,'loading does not run fresh preparation');
  beginServerCombatRound(combat,2);assert.equal(combat.teams[0][0].attack,attack);
  applyHeroDamage(combat.teams[0][0],10000,{round:2,allies:combat.teams[0]});reviveCommanderAlly(combat.teams[0][0],2);
  assert.equal(viewLiveCommanderCombat(combat).teams[0][0].attack,attack);
 }
 assert.equal(prior[0].attack,73,'raw historical snapshot did not receive the new rule');
});

test('same-lane swap selects an assassin center; boosted attackers can hit the center and its defense persists through casualties',()=>{
 const roster=[...otherRoles.slice(0,2),assassins[0],otherRoles[2],otherRoles[3]].map(hero=>({...hero,power:73}));
 const formation={positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:roster.map(h=>h.role)};
 const swapped=swapSameLaneHeroes(formation,roster,2,3);assert.equal(preparationCenterSlot(swapped),3);
 const ordered=swapped.positions.map((index,slot)=>({...roster[index],role:swapped.roles[slot],lane:swapped.lanes[slot]}));
 const teams=prepareLiveArenaTeams(ordered,ordered,{cardAdapter:'auction'}),middle=teams[1][3];
 assert.equal(middle.id,assassins[0].id);assert.ok(middle.centerDefenseBonus);assert.equal(middle.attack,expectedStart(assassins[0],'back',0,null).attack);
 const combat=createLiveCommanderCombat({teams,commanders:[{commanderId:'attack'},{commanderId:'support'}],abilities:createLiveCommanderAbilities({matchKey:'combined:test'})});
 const hit=stepParityBasicAttack(combat,{side:0,actorId:assassins[0].id,allowDamageActive:true,allowThornsPassive:true,allowRoundPassives:true});
 assert.equal(hit.event.target,middle.id);assert.ok(combat.teams[1][3].hp<middle.hp);
 applyHeroDamage(combat.teams[1][0],10000,{round:1,allies:combat.teams[1]});assert.equal(combat.teams[1][3].defense,middle.defense);assert.deepEqual(combat.teams[1][3].centerDefenseBonus,{version:1,multiplier:1.15});
});
