import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createBattleReplayHealth} from '../public/battle-replay-health.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
import {createArenaTeamRenderer} from '../public/arena-team-renderer.js';
import {renderCommanderSkills} from '../public/commander-profile-view.js';
import {Arena3dScene} from '../public/arena-3d-scene.js';
const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
const teams=()=>[0,1].map(()=>[{id:'same',name:'Hero',hp:100,maxHp:100,role:'fighter',lane:'front'}]);
const cast=(side=0)=>({round:1,side,action:'commander-magic-normal',impacts:[{target:'same',kind:'stun',value:1,nextAttack:true}]});
for(const english of [false,true])test(`stun cast and skipped-attack log are truthful (${english?'EN':'TR'})`,()=>{
 const castText=describeBattleEvent({...cast(),actor:'commander:0'},{english});
 const skipText=describeBattleEvent({round:2,side:1,actor:'same',target:'same',action:'stun-skip',value:0},{english});
 assert.match(castText,english?/Stun · Next attack skipped/:/Sersemletme · Sonraki saldırı atlanır/);
 assert.match(skipText,english?/Stunned · Attack skipped/:/Sersemledi · Saldırı atlandı/);
 assert.doesNotMatch(castText+' '+skipText,/Attack reduced|Saldırı azaldı|damage|hasar|%/);
 assert.match(describeBattleEvent({actor:'old',action:'commander-magic-normal',impacts:[{kind:'weaken',value:35}]},{english}),english?/Attack reduced/:/Saldırı azaldı/);
});
for(const side of [0,1])test(`replay pending stun on side ${side} waits through rounds and heals, then clears only the skipped attack`,()=>{
 const replay=createBattleReplayHealth(teams());replay.apply(cast(1-side));
 assert.equal(replay.statusSnapshot()[side][0].commanderStunNextAttack,true);assert.equal(replay.statusSnapshot()[1-side][0].commanderStunNextAttack,undefined);
 replay.apply({round:7,side,actor:'same',target:'same',action:'heal',value:10});
 assert.equal(replay.statusSnapshot()[side][0].commanderStunNextAttack,true);
 const health=replay.apply({round:8,side,actor:'same',target:'same',action:'stun-skip',value:0});
 assert.deepEqual(health,[[100],[100]]);assert.equal(replay.statusSnapshot()[side][0].commanderStunNextAttack,undefined);
});
test('replay death, revival and completion remove pending stun without leaking final-team status into the opening frame',()=>{
 const initial=teams();initial[0][0].commanderStunNextAttack=true;const replay=createBattleReplayHealth(initial);
 assert.equal(replay.statusSnapshot()[0][0].commanderStunNextAttack,undefined);
 replay.apply(cast());replay.apply({round:1,side:0,actor:'same',target:'same',action:'attack',value:100});
 assert.equal(replay.statusSnapshot()[1][0].commanderStunNextAttack,undefined);
 replay.apply({round:2,side:1,actor:'commander:1',target:'same',action:'commander-revive',value:40});
 assert.equal(replay.statusSnapshot()[1][0].commanderStunNextAttack,undefined);
 replay.apply(cast());replay.finish();assert.equal(replay.statusSnapshot()[1][0].commanderStunNextAttack,undefined);
});
for(const side of [0,1])test(`stun-skip on side ${side} never enters attack/projectile animation even with duplicate hero IDs`,()=>{
 const cards=teams().map(team=>({dataset:{heroId:team[0].id}})),effects=[];
 const context={motion:()=>true,document:{documentElement:{lang:'en'},getElementById:id=>({querySelectorAll:()=>[cards[id==='team-a'?0:1]]})},floatingArenaEffect:(...args)=>effects.push(args)};
 const code=source.slice(source.indexOf('function animateMove(e){'),source.indexOf("window.addEventListener('heroarena:experimental-move'"));
 runInNewContext(code+';animateMove({side:'+side+',action:"stun-skip",actorId:"same",targetId:"same",value:0});',context);
 assert.equal(effects.length,1);assert.equal(effects[0][0],cards[side]);assert.equal(effects[0][2],'ATTACK SKIPPED');
});
test('fresh live snapshot without pending stun removes stale local marker; completion also clears it',()=>{
 const state=teams();state[1][0].commanderStunNextAttack=true;let receive;
 const context={window:{addEventListener:(name,fn)=>receive=fn},timer:null,victoryRevealDone:false,states:state,feedbackVersion:0,heroAttacks:{prune(){}},render(){},$:()=>({}),liveArenaMode:false};
 const start=source.indexOf("window.addEventListener('heroarena:experimental-round-end',e=>{");
 const end=source.indexOf('\n});',start)+4;runInNewContext(source.slice(start,end),context);
 receive({detail:{teams:teams(),round:2,events:[]}});assert.equal(state[1][0].commanderStunNextAttack,undefined);
 const fresh=teams();fresh[1][0].commanderStunNextAttack=true;receive({detail:{teams:fresh,round:2,events:[]}});assert.equal(state[1][0].commanderStunNextAttack,true);
 receive({detail:{teams:fresh,round:2,events:[],finished:true}});assert.equal(state[1][0].commanderStunNextAttack,undefined);
});
class Element {
 children=[];parent=null;dataset={};style={setProperty(key,value){this[key]=value;}};attributes={};classes=new Set();
 classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 insertBefore(node,before){this.children=this.children.filter(child=>child!==node);this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(child=>child.textContent).join(' ');}
}
for(const english of [false,true])test(`pending badge and fixed-level skill card read authoritative stun only (${english?'EN':'TR'})`,()=>{
 const document={documentElement:{lang:english?'en':'tr'},createElement:()=>new Element()},root=new Element(),unit=teams()[0][0];
 const renderer=createArenaTeamRenderer({document,loadArt:()=>null});
 const update=()=>renderer.update(root,[unit],{side:0,rows:1,laneRows:{front:[1],back:[]},fittedRows:{front:[1],back:[]},roleNames:{fighter:'Fighter'},flash:{action:'stun-skip',actorId:'same',targetId:'same'}});
 update();const card=root.children[0],badge=card.children[4];assert.equal(badge.hidden,true);
 unit.commanderStunNextAttack=true;update();assert.equal(card.children[4],badge);assert.equal(badge.hidden,false);assert.match(badge.attributes['aria-label'],english?/next attack skipped/:/sonraki saldırı atlanır/);
 assert.equal(card.classes.has('cast'),false);assert.equal(card.classes.has('hit'),false);
 delete unit.commanderStunNextAttack;update();assert.equal(badge.hidden,true);
 unit.commanderStunNextAttack=true;unit.hp=0;update();assert.equal(badge.hidden,true);
 for(const level of [0,20,40]){const skills=new Element();renderCommanderSkills(skills,{commanderId:'magic',levels:{magic:level}},{document,english});const normal=skills.children[0];assert.match(normal.textContent,english?/1 ATTACK.*Stun/:/1 SALDIRI.*Sersemletme/);assert.doesNotMatch(normal.textContent,/%|Weaken|Zayıflat/);}
});

test('3D replay never creates an attack actor, target or projectile for a skipped attack',()=>{
 const scene=Object.create(Arena3dScene.prototype);
 scene.teams=teams();scene.models=new Map();
 for(const side of [0,1]){scene.startFrame({events:[{side,actor:'same',target:'same',action:'stun-skip',value:0}],teams:teams()});assert.equal(scene.active.action.action,'stun-skip');assert.equal(scene.active.actor,undefined);assert.equal(scene.active.target,undefined);assert.equal(scene.active.projectile,undefined);scene.finishFrame();}
});
