import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderNormalPower,commanderNormalBudget,splitCommanderNormalBudget} from '../commander-normal-power.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {simulateBattle} from '../battle-engine.js';
import {battleCard} from '../battle-roster.js';

const profile=(commanderId,level)=>({commanderId,levels:{attack:40,defense:40,support:40,magic:40,[commanderId]:level}});
const hero=(id,role,stats={})=>({id,role,hp:1000,maxHp:1000,attack:0,defense:0,shield:0,...stats});
const team=prefix=>[
 hero(prefix+'fighter','fighter',{attack:120}),hero(prefix+'assassin','assassin',{attack:80}),
 hero(prefix+'tank','tank',{defense:160}),hero(prefix+'support','support',{attack:200,active:{effect:'heal',healRate:.5},commanderHealingBonus:.75}),
 hero(prefix+'energy','energy',{attack:9999,defense:9999})
];
function create(kind,level=15,teams=[team('a'),team('b')]){
 return createLiveCommanderCombat({teams,commanders:[profile(kind,level),profile(kind,level)],abilities:createLiveCommanderAbilities({matchKey:'normal-power',energy:[100,100],now:0})});
}
function cast(combat,side=0,extra={}){return castLiveCommanderCombat(combat,{side,ability:'normal',requestId:'normal_cast_01',matchKey:'normal-power',now:1000,...extra});}
const summary=out=>out.events.at(-1);
const totalDamage=out=>out.events.filter(event=>event.action==='commander-hit').reduce((sum,event)=>sum+event.rawDamage,0);

test('prepared roles produce the level-15 examples: attack 35, shield 47, heal 20',()=>{
 const basis=commanderNormalPower(team('a'));
 assert.deepEqual(basis,{attack:200,defense:160,support:100});assert.ok(Object.isFrozen(basis));
 for(const [kind,total] of [['attack',35],['defense',47],['support',20]]){
  const c=create(kind);c.teams[0][0].hp=100;
  const out=cast(c);assert.equal(summary(out).value,total,kind);
  assert.equal(commanderNormalBudget(basis,profile(kind,15)),total);
 }
});

test('only selected levels add to fixed rates at levels 0, 15 and 40',()=>{
 const basis=commanderNormalPower(team('a'));
 for(const level of [0,15,40])for(const [kind,rolePart] of [['attack',20],['defense',32],['support',5]]){
  assert.equal(commanderNormalBudget(basis,profile(kind,level)),level+rolePart);
 }
});

test('absent matching roles contribute zero; no artificial minimum is added',()=>{
 const basis=commanderNormalPower([hero('mage','energy',{attack:1000,defense:1000})]);
 assert.deepEqual(basis,{attack:0,defense:0,support:0});
 for(const kind of ['attack','defense','support'])for(const level of [0,15,40])assert.equal(commanderNormalBudget(basis,profile(kind,level)),level);
 assert.deepEqual(splitCommanderNormalBudget(0,5),[0,0,0,0,0]);
});

test('rounds only the complete fractional budget, then splits in existing recipient order',()=>{
 const basis=commanderNormalPower([hero('a','fighter',{attack:6.2}),hero('b','assassin',{attack:6.2}),hero('t','tank',{defense:12.4}),hero('s','support',{attack:50,active:{healRate:.5}})]);
 assert.equal(commanderNormalBudget(basis,profile('attack',15)),16);
 assert.equal(commanderNormalBudget(basis,profile('defense',15)),17);
 assert.equal(commanderNormalBudget(basis,profile('support',15)),16);
 assert.deepEqual(splitCommanderNormalBudget(17,3),[6,6,5]);
 const attack=create('attack');attack.teams[1][1].hp=0;attack.teams[1][3].hp=0;
 const hits=cast(attack).events.filter(event=>event.action==='commander-hit');
 assert.deepEqual(hits.map(event=>[event.target,event.rawDamage]),[['bfighter',12],['btank',12],['benergy',11]]);
 const defense=create('defense');defense.teams[0][1].hp=0;defense.teams[0][3].hp=0;
 assert.deepEqual(summary(cast(defense)).impacts.map(event=>[event.target,event.value]),[['afighter',16],['atank',16],['aenergy',15]]);
});

test('support uses configured and default heal rates, excludes commander healing bonus',()=>{
 const rows=[hero('s1','support',{attack:100,active:{healRate:.4},commanderHealingBonus:100}),hero('s2','support',{attack:100}),hero('other','fighter',{attack:10000,active:{healRate:.75}})];
 assert.equal(commanderNormalPower(rows).support,92);
 rows[0].commanderHealingBonus=0;assert.equal(commanderNormalPower(rows).support,92);
});

test('missing role stats are zero in fixtures, but provided invalid role stats and heal rates reject',()=>{
 assert.deepEqual(commanderNormalPower([{role:'fighter'},{role:'assassin'},{role:'tank'},{role:'support'}]),{attack:0,defense:0,support:0});
 for(const value of [null,-1,NaN,Infinity,'100']){
  for(const role of ['fighter','assassin','support'])assert.throws(()=>commanderNormalPower([{role,attack:value}]),/Invalid commander normal attack/);
  assert.throws(()=>commanderNormalPower([{role:'tank',defense:value}]),/Invalid commander normal defense/);
 }
 for(const healRate of [-1,1,NaN,Infinity,'0.5',null])assert.throws(()=>commanderNormalPower([hero('s','support',{active:{healRate}})]),/Invalid ability parameter/);
 assert.throws(()=>commanderNormalPower([hero('a','fighter',{attack:Number.MAX_VALUE}),hero('b','fighter',{attack:Number.MAX_VALUE})]),/Invalid commander normal power/);
});

for(const kind of ['attack','defense','support'])test(kind+' snapshot survives deaths and buffs, and ignores forged cast payloads on either seat',()=>{
 for(const side of [0,1]){
  const original=[team('a'),team('b')],c=create(kind,15,original),initialBasis=structuredClone(c.commanderNormalPower);
  original[side][0].attack=999999;original[side][2].defense=999999;original[side][3].active.healRate=.75;
  for(const unit of c.teams[side]){unit.attack=999999;unit.defense=999999;unit.commanderHealingBonus=999;}
  for(const index of [0,1,2,3])c.teams[side][index].hp=0;
  c.teams[side][4].hp=100;
  const forged={normalBasis:{attack:999999,defense:999999,support:999999},commanderNormalPower:[{attack:999999}],attackBasis:999999,commanderLevel:40,commanderProfile:profile(kind,40)};
  const out=cast(c,side,forged),expected={attack:35,defense:47,support:20}[kind];
  assert.equal(summary(out).value,expected);if(kind==='attack')assert.equal(totalDamage(out),expected);
  assert.deepEqual(c.commanderNormalPower,initialBasis);
  const before=structuredClone(c);assert.equal(cast(c,side,{...forged,now:1001}).duplicate,true);assert.deepEqual(c,before);
  assert.equal(c.abilities.energy[side],60);assert.equal(c.abilities.ultimateEnergy[side],100);assert.equal(c.abilities.cooldownUntil[side],6000);
  assert.equal(viewLiveCommanderCombat(c).commanderNormalPower,undefined,'basis remains server-owned');
 }
});

test('healing prioritizes lowest HP fraction and caps total healing at remaining wounds',()=>{
 const c=create('support');c.teams[0][0].maxHp=10;c.teams[0][0].hp=1;c.teams[0][1].maxHp=20;c.teams[0][1].hp=10;
 const out=cast(c);assert.deepEqual(summary(out).impacts,[{target:'afighter',kind:'heal',value:9},{target:'aassassin',kind:'heal',value:10}]);assert.equal(summary(out).value,19);
 for(const unit of c.teams[0])assert.equal(unit.hp,unit.maxHp);
});

test('fully healthy and fallen-only wounds reject atomically without recording a request',()=>{
 const c=create('support');c.teams[0][3].hp=0;const before=structuredClone(c);
 assert.throws(()=>cast(c),/yaralı kahraman yok/);assert.deepEqual(c,before);
 c.teams[0][0].hp--;assert.equal(summary(cast(c)).value,1,'same request remains available after rejection');
});

test('legacy and live budget capture agree after formation, credits, commander and all start bonuses',()=>{
 // Matching roles include the second rear-slot tank, whose defense gains 15%.
 const cards=['original:08','original:05','original:15','original:01','original:expansion-01'].map((id,i)=>({id,power:80,lane:i<2?'front':'back'}));
 for(const kind of ['attack','defense','support'])for(const level of [0,15,40]){
  const commanders=[profile(kind,level),profile(kind,level)],opts={remainingCredits:[3,3],commanders};
  const prepared=prepareLiveArenaTeams(cards,cards,{...opts,cardAdapter:'auction'});
  const expectedBasis={attack:prepared[0][0].attack+prepared[0][1].attack,defense:prepared[0][3].defense,support:prepared[0][2].attack*.52};
  assert.ok(prepared[0][3].centerDefenseBonus,'center tank bonus included');
  const expected=Math.round(level+expectedBasis[kind]*{attack:.1,defense:.2,support:.05}[kind]);
  const c=createLiveCommanderCombat({teams:prepared,commanders,abilities:createLiveCommanderAbilities({matchKey:'normal-power',energy:[100,100],now:0})});
  assert.deepEqual(c.commanderNormalPower[0],expectedBasis);
  if(kind==='support')for(const unit of c.teams[0])unit.hp=1;
  const live=cast(c),legacy=simulateBattle(cards.map(battleCard),cards.map(battleCard),{...opts,seed:'normal-preparation',maxRounds:2,commanderActions:[{side:0,ability:'normal',round:2}]});
  assert.equal(kind==='attack'?totalDamage(live):summary(live).value,expected);
  const legacyValue=kind==='attack'?legacy.log.filter(event=>event.action==='commander-hit').reduce((sum,event)=>sum+event.rawDamage,0):legacy.log.find(event=>event.action==='commander-'+kind+'-normal').value;
  assert.equal(legacyValue,expected,kind+' level '+level);
 }
});
