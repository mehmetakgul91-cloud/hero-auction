import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {arcaneSurgePresentation} from '../public/arcane-surge-presentation.js';
import {createArenaTeamRenderer} from '../public/arena-team-renderer.js';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {translate} from '../public/crazygames-en.js';
const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
const status={arcaneSurgeBonusAttack:100,arcaneSurgeFromRound:3,arcaneSurgeUntilRound:5};
const teams=()=>[0,1].map(()=>['same','other'].map(id=>({id,name:id,hp:100,maxHp:100,attack:100,role:'fighter',lane:'front'})));
test('badge counts only authoritative inclusive rounds, with a separate scheduled state',()=>{
 const unit={hp:100,...status};
 for(const [round,pending,remaining] of [[2,true,3],[3,false,3],[4,false,2],[5,false,1]]){
  const out=arcaneSurgePresentation(unit,{round});assert.equal(out.pending,pending);assert.equal(out.remaining,remaining);assert.equal(out.bonus,100);
 }
 for(const round of [0,6,undefined,NaN,2.5])assert.equal(arcaneSurgePresentation(unit,{round}),null);
 assert.equal(arcaneSurgePresentation({...unit,hp:0},{round:3}),null);
 assert.equal(arcaneSurgePresentation({hp:100,attack:200},{round:3}),null,'never infer a cast from an attack stat');
});
for(const english of [false,true])test(`special scaling description and tooltip explicitly cover normal, special and area damage (${english?'EN':'TR'})`,()=>{
 const desc=commanderUltimateDescription('magic',{english});assert.match(desc,english?/special ability damage multiplier.*boosted attack/:/özel yeteneğin hasar çarpanı.*güçlendirilmiş saldırıya/);
 assert.match(desc,english?/Healing and shields are unchanged/:/Şifa ve kalkan değişmez/);
 const presentation=arcaneSurgePresentation({hp:100,...status},{round:3,english});assert.match(presentation.description,english?/\+100 attack.*normal, special and area/:/normal, özel ve alan.*\+100 saldırı/);
 assert.equal(translate(commanderUltimateDescription('magic')),commanderUltimateDescription('magic',{english:true}));
});
for(const side of [0,1])test(`live seat ${side}: missing fields clear stale surge, transfer is seat-specific and completion hides even a pending bonus`,()=>{
 const state=teams();Object.assign(state[side][0],status);let receive,lastRound;
 const context={window:{addEventListener:(name,fn)=>receive=fn},timer:null,victoryRevealDone:false,states:state,feedbackVersion:0,heroAttacks:{prune(){}},render(flash,round){lastRound=round;},$:()=>({}),liveArenaMode:false};
 const start=source.indexOf("window.addEventListener('heroarena:experimental-round-end',e=>{"),end=source.indexOf('\n});',start)+4;
 runInNewContext(source.slice(start,end),context);
 receive({detail:{teams:teams(),round:6,events:[]}});assert.equal(state[side][0].arcaneSurgeBonusAttack,undefined);assert.equal(lastRound,6);
 const transferred=teams();Object.assign(transferred[side][1],status);receive({detail:{teams:transferred,round:4,events:[]}});
 assert.equal(state[side][0].arcaneSurgeUntilRound,undefined);assert.equal(state[side][1].arcaneSurgeUntilRound,5);assert.equal(state[1-side][1].arcaneSurgeUntilRound,undefined);
 receive({detail:{teams:transferred,round:4,events:[],finished:true}});assert.equal(state[side][1].arcaneSurgeBonusAttack,undefined);
});
for(const side of [0,1])test(`replay seat ${side}: explicit cast grants status, final state and early finish clear it`,()=>{
 const final=teams();Object.assign(final[side][0],status);const replay=createBattleReplayHealth(final);
 assert.equal(replay.statusSnapshot()[side][0].arcaneSurgeBonusAttack,undefined);
 replay.apply({round:3,side,actor:'commander:'+side,action:'commander-magic-ultimate',impacts:[{target:'same',kind:'buff',value:100,fromRound:3,untilRound:5}]});
 assert.equal(replay.statusSnapshot()[side][0].arcaneSurgeUntilRound,5);replay.finish();assert.equal(replay.statusSnapshot()[side][0].arcaneSurgeUntilRound,undefined);
});
class Element{
 children=[];dataset={};attributes={};style={setProperty(){}};classes=new Set();classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}insertBefore(){}remove(){}setAttribute(key,value){this.attributes[key]=value;}removeAttribute(key){delete this.attributes[key];}
}
for(const english of [false,true])test(`renderer reuses the card, badge and portrait across all rounds (${english?'EN':'TR'})`,()=>{
 const document={documentElement:{lang:english?'en':'tr'},createElement:()=>new Element()},root=new Element(),unit=teams()[0][0];
 const renderer=createArenaTeamRenderer({document,loadArt:()=>null});
 const update=round=>renderer.update(root,[unit],{side:0,rows:1,laneRows:{front:[1],back:[]},fittedRows:{front:[1],back:[]},roleNames:{fighter:'Fighter'},round});
 update(2);const card=root.children[0],badge=card.children[7];assert.equal(badge.hidden,true);
 Object.assign(unit,status,{commanderHuntNextAttack:true,commanderStunNextAttack:true,lastStandReady:true});
 update(2);assert.equal(badge.hidden,false);assert.equal(badge.dataset.state,'pending');assert.equal(card.classes.has('arcane-surge-active'),false);
 for(const round of [3,4,5]){update(round);assert.equal(root.children[0],card);assert.equal(card.children[7],badge);assert.equal(badge.hidden,false);assert.match(badge.textContent,new RegExp(String(6-round)+(english?'R':'T')));assert.equal(card.classes.has('arcane-surge-active'),true);for(const i of [4,5,6])assert.equal(card.children[i].hidden,false);}
 update(6);assert.equal(badge.hidden,true);assert.equal(card.classes.has('arcane-surge-active'),false);
 unit.hp=0;update(3);assert.equal(badge.hidden,true);assert.equal(unit.attack,100);
});
