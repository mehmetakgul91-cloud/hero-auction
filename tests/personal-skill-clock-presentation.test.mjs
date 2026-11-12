import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {heroActionDuration,HERO_SPECIAL_MS,HERO_NORMAL_MS} from '../public/hero-battle-timing.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
import {commanderMagicNormalDescription} from '../public/commander-magic-presentation.js';
import {createArenaTeamRenderer} from '../public/arena-team-renderer.js';
import {abilityImpact,translateAbilityDescription} from '../public/hero-ability-text.js';
const teams=()=>[0,1].map(()=>[{id:'same',name:'Hero',hp:100,maxHp:100,lane:'front',role:'fighter'},{id:'other',name:'Other',hp:100,maxHp:100,lane:'back',role:'fighter'}]);
const cast=(side,round=3)=>({side,round,action:'commander-magic-normal',impacts:[{target:'same',kind:'stun',value:1,nextAction:true,stunVersion:2,passiveSilence:true,blockedRound:round,heroActionClockVersion:1}]});
const action=(side,count,extra={})=>({side,actor:'same',action:'heal',target:'same',value:1,round:count,heroActionClockVersion:1,completedActionTurns:count,heroSpecial:count%3===0,...extra});
for(const side of [0,1])test(`explicit replay counters are side-scoped, idempotent and never copied from final state (${side})`,()=>{
 const initial=teams();initial[side][0].heroActionClockVersion=1;initial[side][0].completedActionTurns=99;
 const replay=createBattleReplayHealth(initial);
 assert.deepEqual(replay.statusSnapshot()[side][0],{});
 replay.apply(action(side,2,{eventId:'heal'}));replay.apply(action(side,2,{eventId:'heal'}));replay.apply(action(side,2,{eventId:'shield',action:'shield'}));
 assert.equal(replay.statusSnapshot()[side][0].completedActionTurns,2);
 assert.equal(replay.statusSnapshot()[1-side][0].completedActionTurns,undefined);
 replay.apply(cast(1-side));replay.apply(action(side,99,{action:'stun-skip',stunScope:'action',stunVersion:2,round:3}));
 assert.equal(replay.statusSnapshot()[side][0].completedActionTurns,2);
 replay.apply(action(side,3,{round:4}));replay.apply(action(side,1,{round:1}));
 assert.equal(replay.statusSnapshot()[side][0].completedActionTurns,3);
});
for(const side of [0,1])test(`new stun retains whole-round silence after consumption and pending flag across rounds (${side})`,()=>{
 const replay=createBattleReplayHealth(teams());replay.apply(cast(1-side));
 replay.apply({round:3,side,actor:'same',action:'stun-skip',stunScope:'action',stunVersion:2});
 let status=replay.statusSnapshot()[side][0];assert.equal(status.commanderStunNextAction,undefined);assert.equal(status.commanderStunBlockedRound,3);assert.equal(status.commanderStunVersion,2);
 replay.apply({round:3,side,actor:'other',action:'heal',value:1});assert.equal(replay.statusSnapshot()[side][0].commanderStunVersion,2);
 replay.apply({round:4});assert.equal(replay.statusSnapshot()[side][0].commanderStunVersion,undefined);
 replay.apply(cast(1-side,5));replay.apply({round:6});assert.equal(replay.statusSnapshot()[side][0].commanderStunNextAction,true);
});
for(const cleanup of ['death','revive','commander-revive','finish'])test(`replay ${cleanup} clears stun but preserves completed actions`,()=>{
 const replay=createBattleReplayHealth(teams());replay.apply(action(1,2));replay.apply(cast(0));
 replay.apply({round:3,side:1,actor:'same',action:'stun-skip',stunScope:'action',stunVersion:2,passiveSilence:true,blockedRound:3});
 if(cleanup==='finish')replay.finish();
 else if(cleanup==='death')replay.apply({side:0,round:3,actor:'same',target:'same',action:'attack',value:100});
 else replay.apply({side:1,round:3,target:'same',action:cleanup,value:55});
 const status=replay.statusSnapshot()[1][0];assert.equal(status.completedActionTurns,2);
 for(const key of ['commanderStunNextAction','commanderStunVersion','commanderStunBlockedRound','commanderStunConsumedRound'])assert.equal(status[key],undefined);
});
test('an interrupted scheduled action uses the explicit actual blocked round in its skip event',()=>{
 const replay=createBattleReplayHealth(teams());replay.apply(cast(0,3));
 replay.apply({round:5,side:1,actor:'same',action:'stun-skip',stunScope:'action',stunVersion:2,passiveSilence:true,blockedRound:5});
 assert.equal(replay.statusSnapshot()[1][0].commanderStunBlockedRound,5);
 assert.equal(replay.statusSnapshot()[1][0].commanderStunNextAction,undefined);
 replay.apply({round:5});assert.equal(replay.statusSnapshot()[1][0].commanderStunVersion,2);
 replay.apply({round:6});assert.equal(replay.statusSnapshot()[1][0].commanderStunVersion,undefined);
});
test('historical attack-only and action-only logs retain old rules without a fabricated counter or passive silence',()=>{
 for(const next of ['nextAttack','nextAction']){
  const replay=createBattleReplayHealth(teams());replay.apply({side:0,round:3,action:'commander-magic-normal',impacts:[{target:'same',kind:'stun',value:1,[next]:true}]});
  assert.equal(replay.statusSnapshot()[1][0].commanderStunVersion,undefined);
  replay.apply({side:1,round:3,actor:'same',action:'stun-skip',stunScope:next==='nextAction'?'action':'attack'});
  replay.apply({side:1,round:4,actor:'same',action:'heal',value:2});assert.deepEqual(replay.statusSnapshot()[1][0],{});
 }
});
test('heal/shield cadence follows explicit personal special metadata; only historical events infer global cadence',()=>{
 for(const kind of ['heal','shield']){
  assert.equal(heroActionDuration({action:kind,round:4,heroActionClockVersion:1,heroSpecial:true}),HERO_SPECIAL_MS);
  assert.equal(heroActionDuration({action:kind,round:3,heroActionClockVersion:1,heroSpecial:false}),HERO_NORMAL_MS);
  assert.equal(heroActionDuration({action:kind,round:3,heroActionClockVersion:1}),HERO_NORMAL_MS);
  assert.equal(heroActionDuration({action:kind,round:3}),HERO_SPECIAL_MS);
  assert.equal(heroActionDuration({action:kind,round:4}),HERO_NORMAL_MS);
 }
});
test('reconnect snapshot removes stale stun and clock fields, imports exact counters, and finish retains counters',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8'),state=teams();let receive;
 Object.assign(state[1][0],{commanderStunVersion:2,commanderStunBlockedRound:3,commanderStunConsumedRound:3,heroActionClockVersion:1,completedActionTurns:99});
 const context={window:{addEventListener:(name,fn)=>receive=fn},timer:null,victoryRevealDone:false,states:state,feedbackVersion:0,heroAttacks:{prune(){}},render(){},$:()=>({}),liveArenaMode:false};
 const start=source.indexOf("window.addEventListener('heroarena:experimental-round-end',e=>{");runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),context);
 receive({detail:{teams:teams(),round:4,events:[]}});assert.equal(state[1][0].commanderStunVersion,undefined);assert.equal(state[1][0].completedActionTurns,undefined);assert.equal(state[1][0].commanderStunConsumedRound,undefined);
 const fresh=teams();Object.assign(fresh[1][0],{commanderStunVersion:2,commanderStunBlockedRound:5,heroActionClockVersion:1,completedActionTurns:3});
 receive({detail:{teams:fresh,round:5,events:[]}});assert.equal(state[1][0].commanderStunVersion,2);assert.equal(state[1][0].completedActionTurns,3);
 receive({detail:{teams:fresh,round:5,events:[],finished:true}});assert.equal(state[1][0].commanderStunVersion,undefined);assert.equal(state[1][0].completedActionTurns,3);
});
class Element {
 children=[];parent=null;dataset={};style={setProperty(){}};attributes={};classes=new Set();
 classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 insertBefore(node,before){this.children=this.children.filter(child=>child!==node);this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
}
for(const english of [false,true])test(`new badge persists after consume only through blocked round, plus truthful localized copy (${english})`,()=>{
 const document={documentElement:{lang:english?'en':'tr'},createElement:()=>new Element()},root=new Element(),unit=teams()[0][0];
 const renderer=createArenaTeamRenderer({document,loadArt:()=>null});
 const update=round=>renderer.update(root,[unit],{round,side:0,rows:1,laneRows:{front:[1],back:[]},fittedRows:{front:[1],back:[]},roleNames:{fighter:'Fighter'}});
 Object.assign(unit,{commanderStunVersion:2,commanderStunBlockedRound:3,commanderStunNextAction:true});update(3);
 const badge=root.children[0].children[4];assert.equal(badge.hidden,false);assert.match(badge.title,english?/counter does not advance/:/sayacı ilerlemez/);
 delete unit.commanderStunNextAction;update(3);assert.equal(badge.hidden,false);assert.match(badge.title,english?/through the end/:/tur sonuna kadar/);
 update(4);assert.equal(badge.hidden,true);unit.commanderStunConsumedRound=4;update(4);assert.equal(badge.hidden,false);unit.hp=0;update(3);assert.equal(badge.hidden,true);
 const description=commanderMagicNormalDescription({english});assert.match(description,english?/Self-triggered passives.*blocked/:/kendi tetiklediği pasifler de engellenir/);assert.match(description,english?/existing rage and shields/:/mevcut öfke ve kalkanlar/);
 assert.match(describeBattleEvent(cast(0),{english}),english?/counter does not advance/:/sayacı ilerlemez/);
 assert.match(describeBattleEvent({action:'stun-skip',stunVersion:2},{english}),english?/through round end/:/Tur sonuna kadar/);
 const active={effect:'burst',power:1.2};assert.match(abilityImpact(active,{english}),english?/Every 3 completed actions/:/Tamamlanan her 3 eylemde/);
 assert.equal(translateAbilityDescription(abilityImpact(active)),abilityImpact(active,{english:true}));
});

test('same-round recast queues next round without lifting consumed-round passive silence',()=>{
 const replay=createBattleReplayHealth(teams());replay.apply(cast(0,3));
 replay.apply({round:3,side:1,actor:'same',action:'stun-skip',stunScope:'action',stunVersion:2,passiveSilence:true,blockedRound:3});
 const recast=cast(0,3);recast.impacts[0].blockedRound=4;replay.apply(recast);
 let status=replay.statusSnapshot()[1][0];
 assert.equal(status.commanderStunConsumedRound,3);assert.equal(status.commanderStunBlockedRound,4);assert.equal(status.commanderStunNextAction,true);
 replay.apply({round:4});status=replay.statusSnapshot()[1][0];
 assert.equal(status.commanderStunConsumedRound,undefined);assert.equal(status.commanderStunBlockedRound,4);assert.equal(status.commanderStunNextAction,true);
});
