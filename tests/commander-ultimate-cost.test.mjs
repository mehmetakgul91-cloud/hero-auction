import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COMMANDER_ABILITY_COSTS,COMMANDER_ULTIMATE_COSTS,getCommanderAbilityCost,getUltimateEnergyCost,commanderRoundEnergy} from '../public/commander-ability-rules.js';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities,castLiveCommanderAbility,grantLiveCommanderEnergy} from '../commander-live-abilities.js';
import {COMMANDER_MAX_ENERGY,validateTurnCommand,calculateNextTurnEnergy,calculateNextTurnUltimateEnergy} from '../commander-turns.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createCommanderProfile} from '../arena-commanders.js';
import {createLiveArenaCommanderControls} from '../public/commander-live-arena-controls.js';
const costs={attack:75,defense:85,magic:100,support:90};
const hero=id=>({id,hp:100,maxHp:100,attack:100,defense:50,speed:50,position:0,role:'fighter',lane:'front',shield:0});
test('archetype prices are explicit while compatibility constant, normal40 and capacity100 remain',()=>{
 assert.deepEqual(COMMANDER_ULTIMATE_COSTS,costs);assert.deepEqual(COMMANDER_ABILITY_COSTS,{normal:40,ultimate:85});assert.equal(COMMANDER_MAX_ENERGY,100);
 for(const [kind,cost]of Object.entries(costs)){assert.equal(getUltimateEnergyCost(kind),cost);assert.equal(getCommanderAbilityCost(kind,'normal'),40);assert.equal(calculateNextTurnEnergy(100,{ability:'ultimate'},{commanderProfile:createCommanderProfile(kind)}),100);assert.equal(calculateNextTurnUltimateEnergy(100,{ability:'ultimate'},{commanderProfile:createCommanderProfile(kind)}),100-cost);}
});
for(const [kind,cost]of Object.entries(costs)){
 for(const energy of new Set([cost-1,cost,100]))test(`${kind} authoritative ultimate price ${cost}, boundary energy ${energy}`,()=>{
  const abilities=createLiveCommanderAbilities({matchKey:'price:'+kind,energy:[energy,100],now:0,commanderIds:['defense','defense']});
  createLiveCommanderCombat({abilities,teams:[[hero('a')],[hero('b')]],commanders:[createCommanderProfile(kind),createCommanderProfile('defense')]});
  assert.equal(abilities.commanderIds[0],kind,'validated combat profile overrides standalone fixture binding');
  assert.equal(viewLiveCommanderAbilities(abilities,0,1000).canUseUltimate,energy>=cost);
  const req={side:0,ability:'ultimate',requestId:'price_request_1',matchKey:'price:'+kind,now:1000};
  if(energy<cost){assert.throws(()=>castLiveCommanderAbility(abilities,req),/energy/);assert.equal(abilities.energy[0],energy);assert.throws(()=>validateTurnCommand('ultimate',{side:0,round:3,energy,ultimateEnergy:energy,commanderId:kind}),/energy/);}
  else{castLiveCommanderAbility(abilities,req);assert.equal(abilities.energy[0],energy);assert.equal(abilities.ultimateEnergy[0],energy-cost);assert.equal(validateTurnCommand('ultimate',{side:0,round:3,energy,ultimateEnergy:energy,commanderId:kind}).ability,'ultimate');assert.equal(castLiveCommanderAbility(abilities,{...req,now:1001}).duplicate,true);assert.equal(abilities.energy[0],energy);assert.equal(abilities.ultimateEnergy[0],energy-cost);}
 });
 test(`${kind} browser button threshold follows selected archetype`,()=>{
  const button=()=>({disabled:false,textContent:'',addEventListener(){},removeEventListener(){}}),normalButton=button(),ultimateButton=button(),energyLabel=button(),statusLabel=button();
  let state={commanderId:kind,ultimateTargetAvailable:true,energy:100,ultimateEnergy:cost-1,cooldownMs:0,finished:false};
  const controls=createLiveArenaCommanderControls({normalButton,ultimateButton,energyLabel,statusLabel,readState:()=>state,onCast:async()=>{}});
  assert.equal(ultimateButton.disabled,true);state.ultimateEnergy=cost;controls.refresh();assert.equal(ultimateButton.disabled,false);assert.equal(normalButton.disabled,false);assert.match(energyLabel.textContent,new RegExp(cost+'/100'));controls.destroy();
 });
}
test('normal spending, cooldown and capacity remain unchanged',()=>{const s=createLiveCommanderAbilities({matchKey:'normal',energy:[85,85],now:0});const r=castLiveCommanderAbility(s,{side:0,ability:'normal',requestId:'normal_1',matchKey:'normal',now:1000});assert.equal(r.energy,45);assert.equal(r.cooldownMs,5000);assert.equal(viewLiveCommanderAbilities(s,0,5999).canUseNormal,false);assert.equal(viewLiveCommanderAbilities(s,0,6000).canUseNormal,true);grantLiveCommanderEnergy(s,0,1000);assert.equal(s.energy[0],100);});
test('invalid and prototype-key IDs or abilities never bypass costs',()=>{
 for(const invalid of ['constructor','toString','__proto__','unknown']){
  assert.throws(()=>getUltimateEnergyCost(invalid),/Invalid/);assert.throws(()=>getCommanderAbilityCost('attack',invalid),/Invalid/);
  const s=createLiveCommanderAbilities({matchKey:'invalid',energy:[100,100],now:0});assert.throws(()=>castLiveCommanderAbility(s,{side:0,ability:invalid,requestId:'invalid_1',matchKey:'invalid',now:1000}),/Invalid/);assert.deepEqual(s.energy,[100,100]);assert.equal(s.casts.length,0);
 }
});
test('training uses dynamic prices and capacity labels remain100',()=>{const training=fs.readFileSync(new URL('../public/commander-training.html',import.meta.url),'utf8');assert.match(training,/getCommanderAbilityCost/);assert.match(training,/Normal enerji: — \/ 100/);});
test('level-zero natural energy reaches attack75 onround5, defense85/support90 onround6 and magic100 onround7',()=>{let energy=0;const values=[];for(let r=1;r<=7;r++)values.push(energy=commanderRoundEnergy(energy,r));assert.deepEqual(values,[30,42,54,66,78,90,100]);for(const [kind,cost]of Object.entries(costs))assert.equal(values.findIndex(e=>e>=cost)+1,{attack:5,defense:6,magic:7,support:6}[kind]);});
