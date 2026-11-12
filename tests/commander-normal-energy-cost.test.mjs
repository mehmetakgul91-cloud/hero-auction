import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMANDER_ABILITY_COSTS,COMMANDER_NORMAL_COSTS,getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities,castLiveCommanderAbility,grantLiveCommanderEnergy} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {validateTurnCommand,calculateNextTurnEnergy,calculateNextTurnUltimateEnergy} from '../commander-turns.js';
import {createRoomCommanderSession,viewRoomCommanderSession,submitRoomCommanderTurn} from '../commander-room-bridge.js';
import {createLiveArenaCommanderControls} from '../public/commander-live-arena-controls.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
import {createCommanderProfile} from '../arena-commanders.js';
import {simulateBattle} from '../battle-engine.js';
import {chooseBotCast} from '../bot-strategy.js';

const costs={attack:40,defense:40,magic:60,support:40};
const unit=id=>({id,hp:500,maxHp:1000,attack:30,defense:20,shield:0,role:'fighter',lane:'front',position:0,speed:20});
const request=(side=0,now=0,requestId='normal_cost_001')=>({matchKey:'normal-cost',side,ability:'normal',now,requestId});
const make=(kind,side=0,energy=100)=>{
 const pools=[100,100];pools[side]=energy;
 // Deliberately use the legacy standalone default to verify authoritative binding.
 const abilities=createLiveCommanderAbilities({matchKey:'normal-cost',energy:pools,ultimateEnergy:[100,100],now:0});
 const commanders=[createCommanderProfile('defense'),createCommanderProfile('defense')];commanders[side]=createCommanderProfile(kind);
 return createLiveCommanderCombat({abilities,teams:[[unit('a')],[unit('b')]],commanders});
};
const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));

test('normal costs are explicit and immutable; legacy generic fixture constant stays 40',()=>{
 assert.deepEqual(COMMANDER_NORMAL_COSTS,costs);assert.ok(Object.isFrozen(COMMANDER_NORMAL_COSTS));
 assert.deepEqual(COMMANDER_ABILITY_COSTS,{normal:40,ultimate:85});
 for(const [kind,cost] of Object.entries(costs))assert.equal(getCommanderAbilityCost(kind,'normal'),cost);
});

for(const [kind,cost] of Object.entries(costs))for(const side of [0,1])for(const energy of [cost-1,cost,100])test(`${kind} seat ${side}: normal costs ${cost} at energy ${energy}, ignoring client cost/profile overrides`,()=>{
 const c=make(kind,side,energy),s=c.abilities;
 assert.equal(s.commanderIds[side],kind);assert.equal(viewLiveCommanderAbilities(s,side,0).canUseNormal,energy>=cost);
 const req={...request(side),targetIds:kind==='magic'?[side?'a':'b']:undefined,cost:0,normalCost:0,energyCost:0,energy:100,commanderId:'attack',commanderIds:['attack','attack'],commanderProfile:createCommanderProfile('attack')};
 const before=structuredClone(c);
 if(energy<cost){
  assert.throws(()=>castLiveCommanderCombat(c,req),/Insufficient commander energy/);
  assert.deepEqual(c,before,'rejected normal cannot alter resources, effect, cooldown, requests or combat');
 }else{
  const result=castLiveCommanderCombat(c,req);
  assert.equal(result.energy,energy-cost);assert.equal(s.ultimateEnergy[side],100);assert.equal(s.ultimateUsed[side],false);
  assert.equal(s.cooldownUntil[side],5000);assert.equal(result.events.at(-1).energy,energy-cost);
  const committed=structuredClone(c);assert.equal(castLiveCommanderCombat(c,{...req,now:1}).duplicate,true);assert.deepEqual(c,committed);
 }
});

test('missing, sparse and unknown commander bindings cannot fall back to the 40-energy fixture cost',()=>{
 for(const invalid of [undefined,null,'unknown','constructor','toString','__proto__']){
  assert.throws(()=>getCommanderAbilityCost(invalid,'normal'),/Invalid commander/);
  assert.throws(()=>createLiveCommanderAbilities({matchKey:'normal-cost',commanderIds:[invalid,'defense']}),/Invalid commander/);
 }
 assert.throws(()=>createLiveCommanderAbilities({matchKey:'normal-cost',commanderIds:new Array(2)}),/Invalid commander/);
 for(const ids of [undefined,['magic'],['unknown','defense']]){
  const s=createLiveCommanderAbilities({matchKey:'normal-cost',energy:[100,100],now:0});s.commanderIds=ids;
  const side=ids?.[0]==='magic'?1:0,before=structuredClone(s);
  assert.throws(()=>viewLiveCommanderAbilities(s,side,0),/Invalid commander/);
  assert.throws(()=>castLiveCommanderAbility(s,request(side)),/Invalid commander/);assert.deepEqual(s,before);
 }
 const explicit=createLiveCommanderAbilities({matchKey:'normal-cost',energy:[59,60],commanderIds:['magic','magic'],now:0});
 assert.equal(viewLiveCommanderAbilities(explicit,0,0).canUseNormal,false);assert.equal(viewLiveCommanderAbilities(explicit,1,0).canUseNormal,true);
});

test('mage repeat casts retain the five-second normal cooldown and independent one-use 100-charge ultimate',()=>{
 const c=make('magic'),s=c.abilities,req={...request(),targetIds:['b']};
 castLiveCommanderCombat(c,req);assert.equal(s.energy[0],40);assert.equal(s.ultimateEnergy[0],100);
 assert.equal(viewLiveCommanderAbilities(s,0,1200).canUseUltimate,true);
 castLiveCommanderCombat(c,{...request(0,1200,'normal_cost_ulti'),ability:'ultimate',targetIds:['a']});
 assert.equal(s.energy[0],40);assert.equal(s.ultimateEnergy[0],0);assert.equal(s.cooldownUntil[0],5000);
 assert.throws(()=>castLiveCommanderCombat(c,{...req,requestId:'normal_cost_002',now:5000}),/Insufficient/);
 grantLiveCommanderEnergy(s,0,20);assert.equal(s.energy[0],60);assert.equal(s.ultimateEnergy[0],0);
 assert.throws(()=>castLiveCommanderCombat(c,{...req,requestId:'normal_cost_002',now:4999}),/cooldown/);
 const repeated={...req,requestId:'normal_cost_002',now:5000};castLiveCommanderCombat(c,repeated);
 assert.equal(s.energy[0],0);assert.equal(s.cooldownUntil[0],10000);assert.equal(s.ultimateUsed[0],true);
 const before=structuredClone(c);assert.equal(castLiveCommanderCombat(c,{...repeated,now:5001}).duplicate,true);assert.deepEqual(c,before);
});

for(const [kind,cost] of Object.entries(costs))test(`${kind}: turn validation, next-turn pools and browser controls agree at ${cost-1}/${cost}`,()=>{
 const commanderProfile=createCommanderProfile(kind),options={side:0,round:4,ultimateEnergy:100,commanderId:kind};
 assert.throws(()=>validateTurnCommand('normal',{...options,energy:cost-1,cost:0}),/Insufficient/);
 assert.equal(validateTurnCommand('normal',{...options,energy:cost,cost:0}).ability,'normal');
 assert.throws(()=>calculateNextTurnEnergy(cost-1,{ability:'normal',cost:0},{commanderProfile}),/unaffordable/);
 assert.equal(calculateNextTurnEnergy(cost,{ability:'normal',cost:0},{commanderProfile}),12);
 assert.equal(calculateNextTurnUltimateEnergy(70,{ability:'normal'},{commanderProfile}),82);
 const button=()=>({textContent:'',addEventListener(){},removeEventListener(){}}),normalButton=button(),ultimateButton=button();
 const state={commanderId:kind,energy:cost-1,ultimateEnergy:100,ultimateTargetAvailable:true,canUseNormal:true};
 const controls=createLiveArenaCommanderControls({normalButton,ultimateButton,energyLabel:button(),statusLabel:button(),readState:()=>state,onCast:async()=>{}});
 assert.equal(normalButton.textContent,'Normal · '+cost);assert.equal(normalButton.disabled,true);
 state.energy=cost;controls.refresh();assert.equal(normalButton.disabled,false);controls.destroy();
});

test('room views and submissions use the saved mage cost, not client 40-energy data',()=>{
 const room={code:'normal-cost',phase:'finished',created:100,matchNumber:1,players:[{token:'alice'},{token:'bob'}]};
 const bound=createRoomCommanderSession(room,{cardsA:cards('a'),cardsB:cards('b'),commanders:[createCommanderProfile('magic'),createCommanderProfile('attack')]});
 bound.session.round=4;bound.session.result={commanderEnergy:[47,28],commanderUltimateEnergy:[60,60]};
 assert.equal(viewRoomCommanderSession(room,bound,'alice').energy,59);assert.equal(viewRoomCommanderSession(room,bound,'alice').canUseNormal,false);
 assert.equal(viewRoomCommanderSession(room,bound,'bob').canUseNormal,true);
 assert.throws(()=>submitRoomCommanderTurn(room,bound,{token:'alice',round:4,command:'normal',energy:100,cost:40,commanderId:'attack'}),/Insufficient/);
 assert.deepEqual(bound.session.pending,[undefined,undefined]);bound.session.result.commanderEnergy[0]=48;
 assert.equal(viewRoomCommanderSession(room,bound,'alice').canUseNormal,true);
 assert.equal(submitRoomCommanderTurn(room,bound,{token:'alice',round:4,command:'normal',cost:0}).ready,false);
});

test('scripted battle normal uses mage 60 versus other 40 and preserves ultimate charge',()=>{
 for(const [kind,cost] of Object.entries(costs)){
  const options={seed:'normal-cost',maxRounds:4,commanders:[createCommanderProfile(kind),createCommanderProfile('defense')]};
  const early={side:0,round:2,ability:'normal',cost:0,commanderId:'attack'};
  if(kind==='magic')assert.throws(()=>simulateBattle(cards('a'),cards('b'),{...options,commanderActions:[early]}),/Insufficient commander energy/);
  else assert.ok(simulateBattle(cards('a'),cards('b'),{...options,commanderActions:[early]}).log.some(e=>e.action===`commander-${kind}-normal`));
  const result=simulateBattle(cards('a'),cards('b'),{...options,commanderActions:[{...early,round:4}]});
  const event=result.log.find(e=>e.action===`commander-${kind}-normal`);
  assert.ok(event);assert.equal(event.ultimateEnergy-event.energy,cost);assert.equal(event.ultimateUsed,false);
 }
});

for(const [kind,cost] of Object.entries(costs))test(`${kind}: bot cannot trust stale normal readiness below ${cost}`,()=>{
 const snapshot={round:1,teams:[[unit('enemy')],[unit('ally')]],abilities:[{},{energy:cost-1,ultimateEnergy:0,canUseNormal:true,canUseUltimate:false}]};
 const options={side:1,now:10000,startedAt:0,lastCastAt:0};
 assert.equal(chooseBotCast(snapshot,kind,'easy',options),null);
 snapshot.abilities[1].energy=cost;assert.equal(chooseBotCast(snapshot,kind,'easy',options)?.ability,'normal');
});

for(const side of [0,1])test(`registry seat ${side}: authenticated mage normal ignores forged 40-cost request at 59/60`,()=>{
 const c=make('magic',side,59),r=createLiveArenaRegistry();r.register({matchKey:'normal-cost',tokens:['alice','bob'],combat:c});
 const token=side?'bob':'alice',req={...request(1-side),token,targetIds:[side?'a':'b'],commanderId:'attack',normalCost:40,cost:0,energy:100};
 const before=structuredClone(c);assert.throws(()=>r.cast(req),/Insufficient commander energy/);assert.deepEqual(c,before);
 assert.equal(r.snapshot({matchKey:'normal-cost',token,now:0}).abilities[side].canUseNormal,false);
 grantLiveCommanderEnergy(c.abilities,side,1);assert.equal(r.snapshot({matchKey:'normal-cost',token,now:0}).abilities[side].canUseNormal,true);
 r.cast(req);assert.equal(c.abilities.energy[side],0);assert.equal(c.abilities.energy[1-side],100);assert.equal(c.abilities.ultimateEnergy[side],100);
});
