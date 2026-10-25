import {translate} from '../public/crazygames-en.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {commanderTargetMode,requiredMagicTargets,validateMagicTargetSelection} from '../public/commander-magic-target-picker.js';
import {mountLiveArenaCommanderBridge} from '../public/commander-live-arena-bridge.js';
import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
class Button{listeners=new Map();disabled=false;textContent='';addEventListener(k,f){this.listeners.set(k,f)}removeEventListener(k){this.listeners.delete(k)}async click(){await this.listeners.get('click')?.()}}
const ui=()=>({normalButton:new Button(),ultimateButton:new Button(),energyLabel:new Button(),statusLabel:new Button()});
test('Av Emri requires exactly one selected living enemy, never a fallback',()=>{
 const opts={commanderId:'attack'},heroes=[{id:'high',hp:90},{id:'low',hp:1},{id:'dead',hp:0}];assert.equal(commanderTargetMode('attack','ultimate'),'enemy-alive');assert.equal(commanderTargetMode('attack','normal'),null);assert.equal(requiredMagicTargets('ultimate',heroes,opts),1);
 for(const targets of [[],['dead'],['high','low'],['missing']])assert.equal(validateMagicTargetSelection('ultimate',heroes,targets,opts),false);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['high'],opts),true);
});
for(const side of [0,1])test(`Av Emri bridge seat ${side} selects opponent, cancel leaves both pools and once flag unchanged`,async()=>{
 const elements=ui(),teams=[[{id:'a',hp:99},{id:'a-dead',hp:0}],[{id:'b',hp:70},{id:'b-dead',hp:0}]],sent=[],picked=[];
 const snapshot={round:1,teams,abilities:[{energy:40,ultimateEnergy:75},{energy:40,ultimateEnergy:75}],ultimateUsed:[false,false]};let cancel=true;
 const bridge=mountLiveArenaCommanderBridge({...elements,side,commanderId:'attack',transport:{snapshot:async()=>snapshot,cast:async c=>sent.push(c),selectCommanderTargets:async(ability,heroes,ctx)=>{picked.push({ability,heroes,ctx});return cancel?null:[heroes[0].id]}}});await bridge.refresh();assert.equal(elements.ultimateButton.disabled,false);
 await elements.ultimateButton.click();assert.equal(sent.length,0);assert.deepEqual(picked[0].heroes,[teams[1-side][0]]);assert.equal(picked[0].ctx.mode,'enemy-alive');assert.equal(snapshot.abilities[side].ultimateEnergy,75);assert.equal(snapshot.ultimateUsed[side],false);
 cancel=false;await elements.ultimateButton.click();assert.deepEqual(sent,[{side,ability:'ultimate',targetIds:[teams[1-side][0].id]}]);bridge.destroy();
});
test('Av Emri text says selected living enemy instead of automatic lowest-health target',()=>{
 assert.match(commanderUltimateDescription('attack'),/Seçilen yaşayan rakibi/);const en=commanderUltimateDescription('attack',{english:true});assert.match(en,/selected living enemy/);assert.doesNotMatch(en,/lowest health ratio/);assert.match(commanderUltimateDescription('attack'),/Hedef ölünceye kadar/);assert.match(en,/Until the target dies.*all allied attacks.*no round or attack-count limit/);assert.match(en,/first death.*does not return if it revives/);assert.match(en,/no extra attack or damage/);assert.doesNotMatch(en,/next attack|next round/);
});

test('full Hunt Order description translates all duration, healing and area-target rules',()=>{
 const tr=commanderUltimateDescription('attack'),en=commanderUltimateDescription('attack',{english:true});
 assert.equal(translate(tr),en);
 assert.match(en,/Healing and shield actions are not turned into attacks/);
 assert.match(en,/other area-attack targets are unchanged/);
 assert.match(en,/Once per battle/);
});
