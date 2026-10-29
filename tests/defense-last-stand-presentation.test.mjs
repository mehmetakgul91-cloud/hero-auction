import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {commanderTargetMode,validateMagicTargetSelection} from '../public/commander-magic-target-picker.js';
import {createMagicCastControls} from '../public/commander-magic-cast-controls.js';
import {mountLiveArenaCommanderBridge} from '../public/commander-live-arena-bridge.js';
import {createArenaTeamRenderer} from '../public/arena-team-renderer.js';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
import {renderCommanderSkills} from '../public/commander-profile-view.js';
const lastStandKeys=['lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'];
const teams=()=>[0,1].map(()=>[{id:'same',name:'Hero',hp:100,maxHp:100,role:'fighter',lane:'front'}]);
const cast=(side=0)=>({round:1,side,actor:'commander:'+side,action:'commander-defense-ultimate',impacts:[{target:'same',kind:'guard',value:1,immortalRounds:2}]});
const trigger=(side=0,round=8)=>({round,side:1-side,actor:'same',target:'same',action:'attack',value:99,guardTriggered:true,lastStandTriggeredRound:round,lastStandImmortalUntilRound:round+2});
class Node {
 children=[];parent=null;dataset={};attributes={};classes=new Set();listeners=new Map();hidden=false;disabled=false;
 style={setProperty(key,value){this[key]=value;}};classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
 addEventListener(key,fn){this.listeners.set(key,[...(this.listeners.get(key)||[]),fn]);}
 removeEventListener(key,fn){this.listeners.set(key,(this.listeners.get(key)||[]).filter(f=>f!==fn));}
 async fire(key,event={}){for(const fn of this.listeners.get(key)||[])await fn(event);}
 querySelectorAll(){return this.cards||[];}contains(node){return (this.cards||[]).includes(node);}closest(){return this;}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 insertBefore(node,before){this.children=this.children.filter(child=>child!==node);this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(child=>child.textContent).join(' ');}
}
function pickerFixture(onCast=async()=>{}){
 const enemyRoot=new Node(),allyRoot=new Node(),confirmButton=new Node(),cancelButton=new Node(),status=new Node();
 allyRoot.cards=['same','other','dead'].map(id=>{const n=new Node();n.dataset.heroId=id;return n;});
 enemyRoot.cards=['same'].map(id=>{const n=new Node();n.dataset.heroId=id;return n;});
 const controls=createMagicCastControls({enemyRoot,allyRoot,confirmButton,cancelButton,status,commanderId:'defense',onCast});
 const heroes=[{id:'same',hp:100},{id:'other',hp:50},{id:'dead',hp:0}];
 return {enemyRoot,allyRoot,confirmButton,cancelButton,status,controls,heroes};
}
test('defense ultimate accepts exactly one living ally; normal still has no target picker',()=>{
 assert.equal(commanderTargetMode('defense','ultimate'),'ally-alive');assert.equal(commanderTargetMode('defense','normal'),null);
 const heroes=[{id:'a',hp:10},{id:'b',hp:0}],options={commanderId:'defense'};
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a'],options),true);
 for(const ids of [[],['b'],['a','a'],['a','b'],['enemy']])assert.equal(validateMagicTargetSelection('ultimate',heroes,ids,options),false);
});
test('defense picker uses own living cards, does not cast before confirm, and cancel spends nothing',async()=>{
 const sent=[],f=pickerFixture(async value=>sent.push(value));f.controls.begin('ultimate',f.heroes);
 await f.enemyRoot.fire('click',{target:f.enemyRoot.cards[0]});assert.equal(f.confirmButton.disabled,true);
 await f.allyRoot.fire('click',{target:f.allyRoot.cards[2]});assert.equal(f.confirmButton.disabled,true);
 await f.allyRoot.fire('click',{target:f.allyRoot.cards[1]});assert.equal(f.confirmButton.disabled,false);assert.deepEqual(sent,[]);
 assert.match(f.allyRoot.cards[1].attributes['data-commander-target-label'],/SON KALE/);
 await f.cancelButton.fire('click');assert.deepEqual(sent,[]);assert.equal(f.controls.isSelecting(),false);
 f.controls.begin('ultimate',f.heroes);await f.allyRoot.fire('click',{target:f.allyRoot.cards[1]});await f.confirmButton.fire('click');
 assert.deepEqual(sent,[{ability:'ultimate',targetIds:['other']}]);assert.equal(f.confirmButton.hidden,true);f.controls.destroy();
});
test('target dying during selection invalidates confirmation; repeat confirms cannot double-submit pending cast',async()=>{
 let release;const sent=[],f=pickerFixture(value=>{sent.push(value);return new Promise(resolve=>release=resolve);});
 f.controls.begin('ultimate',f.heroes);await f.allyRoot.fire('click',{target:f.allyRoot.cards[1]});
 f.controls.refresh(f.heroes.map(hero=>({...hero,hp:hero.id==='other'?0:hero.hp})));await f.confirmButton.fire('click');assert.deepEqual(sent,[]);
 await f.allyRoot.fire('click',{target:f.allyRoot.cards[0]});const pending=f.confirmButton.fire('click');await f.confirmButton.fire('click');await f.cancelButton.fire('click');
 assert.equal(sent.length,1);assert.equal(f.cancelButton.disabled,true);release();await pending;assert.equal(f.controls.isSelecting(),false);f.controls.destroy();
});
test('defense picker rejects without claiming success and can retry the same chosen ally',async()=>{
 let count=0;const f=pickerFixture(async()=>{if(++count===1)throw Error('Target rejected');});
 f.controls.begin('ultimate',f.heroes);await f.allyRoot.fire('click',{target:f.allyRoot.cards[0]});await f.confirmButton.fire('click');
 assert.match(f.status.textContent,/Target rejected/);assert.equal(f.confirmButton.disabled,false);await f.confirmButton.fire('click');assert.equal(count,2);assert.equal(f.controls.isSelecting(),false);f.controls.destroy();
});
for(const side of [0,1])test(`bridge requires selector and living own target on seat ${side}; cancelled selection never casts`,async()=>{
 const ui={normalButton:new Node(),ultimateButton:new Node(),energyLabel:new Node(),statusLabel:new Node()},sent=[];
 let snapshot={round:1,teams:teams(),abilities:[0,1].map(()=>({energy:100,ultimateEnergy:100,canUseNormal:true,canUseUltimate:true,finished:false}))},selection=null;
 const transport={snapshot:async()=>snapshot,cast:async c=>sent.push(c)};
 let bridge=mountLiveArenaCommanderBridge({...ui,side,commanderId:'defense',transport});await bridge.refresh();assert.equal(ui.ultimateButton.disabled,true);bridge.destroy();
 transport.selectCommanderTargets=async(ability,heroes,context)=>{assert.equal(context.mode,'ally-alive');assert.equal(context.side,side);assert.equal(heroes.length,1);return selection;};
 bridge=mountLiveArenaCommanderBridge({...ui,side,commanderId:'defense',transport});await bridge.refresh();assert.equal(ui.ultimateButton.disabled,false);await ui.ultimateButton.fire('click');assert.deepEqual(sent,[]);
 selection=['same'];await ui.ultimateButton.fire('click');assert.deepEqual(sent,[{ability:'ultimate',targetIds:['same'],side}]);
 snapshot.teams[side][0].hp=0;await bridge.refresh();assert.equal(ui.ultimateButton.disabled,true);bridge.destroy();
});
for(const side of [0,1])test(`replay seat ${side} waits for lethal trigger, never refreshes duration and expires after two full following rounds`,()=>{
 const final=teams();Object.assign(final[side][0],{lastStandTriggeredRound:8,lastStandImmortalUntilRound:10});const replay=createBattleReplayHealth(final);
 assert.deepEqual(replay.statusSnapshot(),[[{}],[{}]]);replay.apply(cast(side));replay.apply({round:7,action:'delay'});
 assert.equal(replay.statusSnapshot()[side][0].lastStandReady,true);assert.equal(replay.statusSnapshot()[1-side][0].lastStandReady,undefined);
 replay.apply(trigger(side));assert.equal(replay.statusSnapshot()[side][0].lastStandReady,undefined);assert.equal(replay.statusSnapshot()[side][0].lastStandImmortalUntilRound,10);
 replay.apply({...trigger(side),round:10,value:0});assert.equal(replay.statusSnapshot()[side][0].lastStandImmortalUntilRound,10);
 assert.equal(replay.apply({round:10,side,actor:'same',target:'same',action:'heal',value:40})[side][0],41);
 replay.apply({round:11,action:'delay'});assert.deepEqual(replay.statusSnapshot()[side][0],{});
});
test('old one-hit logs do not gain immortality; death, revival, finish and fresh replay clear all protection',()=>{
 const replay=createBattleReplayHealth(teams());const old=cast();delete old.impacts[0].immortalRounds;replay.apply(old);replay.apply({round:2,side:1,actor:'same',target:'same',action:'attack',value:99,guardTriggered:true});assert.deepEqual(replay.statusSnapshot(),[[{}],[{}]]);
 for(const ending of ['death','revive','finish']){
  const r=createBattleReplayHealth(teams());r.apply(cast());r.apply(trigger());
  if(ending==='finish')r.finish();else if(ending==='revive')r.apply({round:9,side:0,actor:'commander:0',target:'same',action:'commander-revive',value:40});else r.apply({round:9,side:1,actor:'same',target:'same',action:'attack',value:1,hpSnapshot:[[0],[100]]});
  assert.deepEqual(r.statusSnapshot()[0][0],{},ending);
 }
 assert.deepEqual(createBattleReplayHealth(teams()).statusSnapshot(),[[{}],[{}]]);
});
for(const english of [false,true])test(`armed and immortal badges are distinct and authoritative (${english?'EN':'TR'})`,()=>{
 const document={documentElement:{lang:english?'en':'tr'},createElement:()=>new Node()},root=new Node(),unit=teams()[0][0];const renderer=createArenaTeamRenderer({document,loadArt:()=>null});
 const update=()=>renderer.update(root,[unit],{side:0,rows:1,laneRows:{front:[1],back:[]},fittedRows:{front:[1],back:[]},roleNames:{fighter:'Fighter'}});
 update();const card=root.children[0],badge=card.children[5];assert.equal(badge.hidden,true);
 Object.assign(unit,{lastStandReady:true,lastStandPersistent:true,lastStandImmortalRounds:2});update();assert.equal(badge.hidden,false);assert.equal(badge.dataset.state,'armed');assert.match(badge.title,english?/waiting for the first lethal hit/:/ilk ölümcül darbeyi bekliyor/);
 for(const key of lastStandKeys)delete unit[key];Object.assign(unit,{lastStandTriggeredRound:8,lastStandImmortalUntilRound:10});update();assert.equal(card.children[5],badge);assert.equal(badge.dataset.state,'active');assert.match(badge.title,english?/through round 10/:/10. tur sonuna kadar/);
 unit.commanderStunNextAttack=true;update();assert.equal(card.children[4].hidden,false);assert.equal(badge.hidden,false);
 unit.hp=0;update();assert.equal(badge.hidden,true);unit.hp=40;for(const key of lastStandKeys)delete unit[key];update();assert.equal(badge.hidden,true);
 const skills=new Node();renderCommanderSkills(skills,{commanderId:'defense',levels:{defense:40}},{document,english});assert.match(skills.textContent,english?/selected ally.*next 2 full rounds/:/seçilen müttefike.*sonraki 2 tam tur/);
});
test('new-rule logs show exact expiry while historical logs keep their one-hit description',()=>{
 for(const english of [false,true]){
  assert.match(describeBattleEvent(trigger(),{english}),english?/health stays at least 1 through round 10/:/10. tur sonuna kadar can en az 1/);
  assert.match(describeBattleEvent(cast(),{english}),english?/next 2 full rounds/:/sonraki 2 tam tur/);
  assert.doesNotMatch(describeBattleEvent({side:1,action:'attack',value:99,guardTriggered:true},{english}),/round 10|2 full|2 tam/);
 }
});
test('new live snapshots remove old armed/active fields and battle completion clears supplied protection',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8'),state=teams();Object.assign(state[0][0],{lastStandReady:true,lastStandPersistent:true,lastStandImmortalRounds:2});let receive;
 const context={window:{addEventListener:(name,fn)=>receive=fn},timer:null,victoryRevealDone:false,states:state,feedbackVersion:0,heroAttacks:{prune(){}},render(){},$:()=>({}),liveArenaMode:false};
 const start=source.indexOf("window.addEventListener('heroarena:experimental-round-end',e=>{"),end=source.indexOf('\n});',start)+4;runInNewContext(source.slice(start,end),context);
 const active=teams();Object.assign(active[0][0],{lastStandTriggeredRound:8,lastStandImmortalUntilRound:10});receive({detail:{teams:active,round:8,events:[]}});assert.equal(state[0][0].lastStandReady,undefined);assert.equal(state[0][0].lastStandImmortalUntilRound,10);
 receive({detail:{teams:teams(),round:11,events:[]}});for(const key of lastStandKeys)assert.equal(state[0][0][key],undefined);
 receive({detail:{teams:active,round:8,events:[],finished:true}});for(const key of lastStandKeys)assert.equal(state[0][0][key],undefined);
});


test('real server cast and lethal-hit metadata replay the chosen ally without guessing a duration',async()=>{
 const {createLiveCommanderCombat,castLiveCommanderCombat,applyServerHeroAction}=await import('../commander-live-combat.js');
 const {createLiveCommanderAbilities}=await import('../commander-live-abilities.js');
 const initial=teams();initial[0].push({...initial[0][0],id:'lower',hp:1});
 const c=createLiveCommanderCombat({round:3,teams:initial,commanders:[{commanderId:'defense'},{commanderId:'attack'}],abilities:createLiveCommanderAbilities({matchKey:'defense-ui-replay',energy:[100,100],now:0})});
 const castResult=castLiveCommanderCombat(c,{side:0,ability:'ultimate',targetIds:['same'],requestId:'defense_ui_cast_001',matchKey:'defense-ui-replay',now:1000});
 const castEvents=structuredClone(castResult.events);const hit=applyServerHeroAction(c,{side:1,actorId:'same',targetId:'same',value:10000}).event;
 const replay=createBattleReplayHealth(c.teams);for(const event of castEvents)replay.apply(event);
 assert.equal(replay.statusSnapshot()[0][0].lastStandReady,true);assert.equal(replay.statusSnapshot()[0][1].lastStandReady,undefined);
 replay.apply(hit);assert.equal(replay.statusSnapshot()[0][0].lastStandTriggeredRound,3);assert.equal(replay.statusSnapshot()[0][0].lastStandImmortalUntilRound,5);
 assert.match(describeBattleEvent(castEvents.find(event=>event.action==='commander-defense-ultimate'),{english:true,names:new Map([['same','Chosen Ally']])}),/→ Chosen Ally/);
});


test('malformed or stale replay metadata cannot restore expired immortality',()=>{
 const bad=[{round:7},{round:11},{round:undefined},{lastStandTriggeredRound:8,lastStandImmortalUntilRound:11},{lastStandTriggeredRound:'8'},{lastStandTriggeredRound:0,lastStandImmortalUntilRound:2}];
 for(const fields of bad){const replay=createBattleReplayHealth(teams());replay.apply(cast());replay.apply({...trigger(),...fields});assert.equal(replay.statusSnapshot()[0][0].lastStandImmortalUntilRound,undefined,JSON.stringify(fields));}
 const replay=createBattleReplayHealth(teams());replay.apply(cast());replay.apply(trigger());replay.apply({round:11,action:'delay'});replay.apply({...trigger(),value:0});assert.equal(replay.statusSnapshot()[0][0].lastStandImmortalUntilRound,undefined);
});
test('badge rejects non-two-round or malformed immortal snapshot fields',()=>{
 const document={documentElement:{lang:'en'},createElement:()=>new Node()},root=new Node(),unit=teams()[0][0],renderer=createArenaTeamRenderer({document,loadArt:()=>null});
 for(const fields of [{lastStandTriggeredRound:8,lastStandImmortalUntilRound:9},{lastStandTriggeredRound:8,lastStandImmortalUntilRound:11},{lastStandTriggeredRound:'8',lastStandImmortalUntilRound:10},{lastStandTriggeredRound:0,lastStandImmortalUntilRound:2}]){
  Object.assign(unit,fields);renderer.update(root,[unit],{side:0,rows:1,laneRows:{front:[1],back:[]},fittedRows:{front:[1],back:[]},roleNames:{fighter:'Fighter'}});assert.equal(root.children[0].children[5].hidden,true,JSON.stringify(fields));
 }
});

test('legacy training defense uses authoritative friendly picker, cancels and validates selected target before sending',async()=>{
 const {getCommanderAbilityCost}=await import('../public/commander-ability-rules.js');
 const {trainingCommanderResources,trainingCommanderEnemyTargets,trainingCommanderFriendlyTargets}=await import('../public/commander-training-resources.js');
 const {commanderUltimateDescription}=await import('../public/commander-ultimate-presentation.js');
 const source=readFileSync(new URL('../public/commander-training.html',import.meta.url),'utf8').split('<script type="module">')[1].split('</script>')[0].replace(/^import .*;\n/gm,'');
 class TrainingNode extends Node{value='defense';}
 const nodes=new Map(),requests=[],document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new TrainingNode());return nodes.get(id);},createElement:()=>new TrainingNode()};
 runInNewContext(source,{document,getCommanderAbilityCost,trainingCommanderResources,trainingCommanderEnemyTargets,trainingCommanderFriendlyTargets,commanderUltimateDescription,describeBattleEvent,fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 const data=()=>({rounds:15,teams:[[{id:'high',name:'High',maxHp:100},{id:'low',name:'Low',maxHp:100}],[{id:'enemy',name:'Enemy',maxHp:100}]],log:[],commanderResourcesByRound:Array.from({length:15},(_,i)=>({round:i+1,energy:[100,100],ultimateEnergy:[100,100],ultimateUsed:[false,false],targets:[[{id:'high',hp:i<5?90:0},{id:'low',hp:1}],[{id:'enemy',hp:100}]]}))});
 const reply=async(index,value,ok=true)=>{requests[index].resolve({ok,json:async()=>value});await new Promise(r=>setImmediate(r));};await reply(0,data());
 assert.equal(nodes.get('ultimate').disabled,true);assert.equal(nodes.get('focus-target-field').hidden,false);assert.equal(nodes.get('focus-target-label').textContent,'Son Kale hedefi');
 nodes.get('focus-target').value='enemy';await nodes.get('ultimate').onclick();assert.equal(requests.length,1);
 nodes.get('focus-target').value='high';nodes.get('focus-target').onchange();assert.equal(nodes.get('ultimate').disabled,false);nodes.get('focus-cancel').onclick();assert.equal(requests.length,1);assert.equal(nodes.get('ultimate').disabled,true);
 nodes.get('focus-target').value='high';nodes.get('focus-target').onchange();for(let i=0;i<5;i++)nodes.get('advance').onclick();assert.equal(nodes.get('focus-target').value,'');assert.equal(nodes.get('ultimate').disabled,true);
 nodes.get('focus-target').value='low';nodes.get('focus-target').onchange();const cast=nodes.get('ultimate').onclick();assert.deepEqual(JSON.parse(requests[1].options.body).actions,[{round:6,ability:'ultimate',targetIds:['low']}]);await reply(1,{error:'target no longer alive'},false);await cast;assert.equal(nodes.get('focus-target').value,'');assert.equal(nodes.get('ultimate').disabled,true);assert.equal(nodes.get('ultimate-energy-label').textContent,'Ulti dolumu: 100 / 100');
});
