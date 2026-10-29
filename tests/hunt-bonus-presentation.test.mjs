import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
import {createArenaTeamRenderer} from '../public/arena-team-renderer.js';
import {renderCommanderSkills} from '../public/commander-profile-view.js';
import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {translate} from '../public/crazygames-en.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
const teams=()=>[0,1].map(()=>['same','other'].map(id=>({id,name:'Hero '+id,hp:100,maxHp:100,role:'fighter',lane:'front'})));
const cast=(side=0)=>({round:1,version:1,side,actor:'commander:'+side,action:'commander-attack-ultimate',focusUntilDeath:true,impacts:[{target:'same',kind:'focus',value:2,untilDeath:true},{target:'same',kind:'hunt-buff',value:20,nextAttack:true},{target:'other',kind:'hunt-buff',value:20,nextAttack:true}]});
for(const english of [false,true])test(`Hunt Order describes two independent effects, fixed attack bonus and nonconsuming actions (${english?'EN':'TR'})`,()=>{
 const desc=commanderUltimateDescription('attack',{english});
 assert.match(desc,english?/Until the target dies.*20% for its next attack only/:/Hedef ölünceye kadar.*sonraki tek saldırısındaki saldırı değeri %20/);
 assert.match(desc,english?/does not stack/:/birikmez/);assert.match(desc,english?/Stun-skipped attacks, healing and shield-only actions do not consume/:/Sersemleme nedeniyle atlanan saldırı, şifa ve yalnız kalkan eylemleri bonusu tüketmez/);
 const log=describeBattleEvent(cast(),{english});assert.match(log,english?/Focus until the target dies.*\+20% attack for its next attack only/:/Hedef ölünceye kadar.*\+%20 saldırı/);
 const legacy=cast();legacy.impacts=legacy.impacts.filter(i=>i.kind==='focus');assert.doesNotMatch(describeBattleEvent(legacy,{english}),/20|%/);
 const used=describeBattleEvent({side:0,actor:'same',target:'same',action:'attack',value:70,huntAttackConsumed:true},{english});assert.match(used,english?/one-attack \+20% attack used/:/tek saldırılık \+%20 saldırı kullanıldı/);
 assert.equal(translate(commanderUltimateDescription('attack')),commanderUltimateDescription('attack',{english:true}));
});
for(const side of [0,1])test(`replay side ${side}: allied bonus persists through turns, heal, shield and stun; one hero's attack consumes only its own charge`,()=>{
 const replay=createBattleReplayHealth(teams()),event=cast(side);replay.apply(event);
 assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,true);assert.equal(replay.statusSnapshot()[1-side][0].commanderHuntNextAttack,undefined);
 assert.equal(replay.statusSnapshot()[1-side][0].commanderFocusUntilDeath,true);
 for(const action of ['round-start','heal','shield','stun-skip'])replay.apply({round:5,side,actor:'same',target:'same',action,value:0});
 assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,true);
 replay.apply({round:6,version:2,side,actor:'same',target:'same',action:'attack',value:10,damageType:'normal',huntAttackConsumed:true});
 assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,undefined);assert.equal(replay.statusSnapshot()[side][1].commanderHuntNextAttack,true);
 assert.equal(replay.statusSnapshot()[1-side][0].commanderFocusUntilDeath,true);
 replay.apply(JSON.parse(JSON.stringify(event)));assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,undefined,'replayed cast cannot regrant a consumed charge');
});
for(const side of [0,1])test(`replay side ${side}: death clears its bonus; focus death does not remove remaining allied bonuses; revival grants none`,()=>{
 const replay=createBattleReplayHealth(teams());replay.apply(cast(side));
 replay.apply({round:1,side,actor:'other',target:'same',action:'attack',value:100});
 assert.equal(replay.statusSnapshot()[1-side][0].commanderFocusUntilDeath,undefined);assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,true);
 replay.apply({round:1,side:1-side,actor:'other',target:'same',action:'attack',value:100});assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,undefined);
 replay.apply({round:2,side,actor:'commander:'+side,target:'same',action:'commander-revive',value:40});assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,undefined);
 assert.equal(replay.statusSnapshot()[side][1].commanderHuntNextAttack,true);replay.finish();assert.equal(replay.statusSnapshot()[side][1].commanderHuntNextAttack,undefined);
});
test('replay ignores final team bonus at opening and cannot infer bonus from historical focus-only cast',()=>{
 const final=teams();final[0][0].commanderHuntNextAttack=true;const replay=createBattleReplayHealth(final);
 assert.equal(replay.statusSnapshot()[0][0].commanderHuntNextAttack,undefined);
 const event=cast();event.impacts=event.impacts.filter(i=>i.kind==='focus');replay.apply(event);assert.equal(replay.statusSnapshot()[0][0].commanderHuntNextAttack,undefined);
});
test('replay excludes allies already fallen at cast even if stale impact metadata names them',()=>{
 const replay=createBattleReplayHealth(teams());replay.apply({round:1,side:1,actor:'same',target:'same',action:'attack',value:100});replay.apply(cast());
 assert.equal(replay.statusSnapshot()[0][0].commanderHuntNextAttack,undefined);assert.equal(replay.statusSnapshot()[0][1].commanderHuntNextAttack,true);
});
test('fresh live snapshot removes stale hunt bonus and completion clears the last pending charge',()=>{
 const state=teams();state[0][0].commanderHuntNextAttack=true;let receive;
 const context={window:{addEventListener:(name,fn)=>receive=fn},timer:null,victoryRevealDone:false,states:state,feedbackVersion:0,heroAttacks:{prune(){}},render(){},$:()=>({}),liveArenaMode:false};
 const start=source.indexOf("window.addEventListener('heroarena:experimental-round-end',e=>{"),end=source.indexOf('\n});',start)+4;
 runInNewContext(source.slice(start,end),context);receive({detail:{teams:teams(),round:2,events:[]}});assert.equal(state[0][0].commanderHuntNextAttack,undefined);
 const fresh=teams();fresh[0][0].commanderHuntNextAttack=true;receive({detail:{teams:fresh,round:2,events:[]}});assert.equal(state[0][0].commanderHuntNextAttack,true);
 receive({detail:{teams:fresh,round:2,events:[],finished:true}});assert.equal(state[0][0].commanderHuntNextAttack,undefined);
});
for(const side of [0,1])test(`real server cast and AoE action replay the bonus once on seat ${side}`,()=>{
 const initial=teams().map(team=>team.map((unit,position)=>({...unit,hp:1000,maxHp:1000,attack:100,defense:20,speed:50,position,shield:0,role:position===0?'energy':'fighter'})));
 const commanders=[{commanderId:'defense'},{commanderId:'defense'}];commanders[side]={commanderId:'attack'};
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'hunt-ui',energy:[100,100],now:0}),teams:initial,commanders,round:3});
 const replay=createBattleReplayHealth(initial),result=castLiveCommanderCombat(combat,{side,ability:'ultimate',requestId:'hunt-ui-cast',matchKey:'hunt-ui',now:0,targetIds:['same']});
 for(const event of result.events)replay.apply(event);
 assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,true);assert.equal(replay.statusSnapshot()[1-side][0].commanderFocusUntilDeath,true);
 const move=stepParityEnergySplash(combat,{side,actorId:'same',critical:false});assert.equal(move.events.filter(event=>event.huntAttackConsumed).length,1);
 let health;for(const event of move.events)health=replay.apply(event);
 assert.deepEqual(health,combat.teams.map(team=>team.map(unit=>unit.hp)));assert.equal(replay.statusSnapshot()[side][0].commanderHuntNextAttack,undefined);assert.equal(replay.statusSnapshot()[side][1].commanderHuntNextAttack,true);
});
class Element {
 children=[];parent=null;dataset={};style={setProperty(key,value){this[key]=value;}};attributes={};classes=new Set();
 classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 insertBefore(node,before){this.children=this.children.filter(child=>child!==node);this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 setAttribute(key,value){this.attributes[key]=value;}removeAttribute(key){delete this.attributes[key];}
 set textContent(value){this.text=String(value);this.children=[];}get textContent(){return (this.text||'')+this.children.map(child=>child.textContent).join(' ');}
}
for(const english of [false,true])test(`authoritative pending bonus badge coexists with stun and protection; profile shows fixed bonus (${english?'EN':'TR'})`,()=>{
 const document={documentElement:{lang:english?'en':'tr'},createElement:()=>new Element()},root=new Element(),unit=teams()[0][0];
 const renderer=createArenaTeamRenderer({document,loadArt:()=>null});const update=()=>renderer.update(root,[unit],{side:0,rows:1,laneRows:{front:[1],back:[]},fittedRows:{front:[1],back:[]},roleNames:{fighter:'Fighter'}});
 update();const card=root.children[0],badge=card.children[6];assert.equal(badge.hidden,true);
 Object.assign(unit,{commanderHuntNextAttack:true,commanderStunNextAttack:true,lastStandReady:true});update();assert.equal(card.children[6],badge);assert.equal(badge.hidden,false);assert.equal(card.children[4].hidden,false);assert.equal(card.children[5].hidden,false);
 assert.match(badge.attributes['aria-label'],english?/\+20% attack for the next attack only/:/sonraki tek saldırı için \+%20 saldırı/);
 delete unit.commanderHuntNextAttack;update();assert.equal(badge.hidden,true);unit.commanderHuntNextAttack=true;unit.hp=0;update();assert.equal(badge.hidden,true);
 for(const level of [0,20,40]){const skills=new Element();renderCommanderSkills(skills,{commanderId:'attack',levels:{attack:level}},{document,english});const ultimate=skills.children[1];assert.match(ultimate.textContent,english?/75 ULTIMATE CHARGE.*\+20% attack for its next attack only/:/75 ULTİ DOLUMU.*\+%20 saldırı/);}
});
