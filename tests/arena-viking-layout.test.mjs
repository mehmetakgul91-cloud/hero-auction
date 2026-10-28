import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeVikingLayout,mountVikingLayout} from '../public/arena-viking-layout.js';
import {getArenaLaneLayout,ARENA_LANE_TRACKS} from '../public/arena-viewport.js';
const EPS=1e-6;
const close=(a,b)=>assert.ok(Math.abs(a-b)<EPS,`${a} ≠ ${b}`);
const teamsFor=(a,b)=>[a,b].map(front=>Array.from({length:5},(_,i)=>({id:i,lane:i<front?'front':'back',hp:100})));
const WIDTHS=[256,288,308,318,348,360,378,390,428,576,700,850,1138];
const HEIGHTS=[180,220,280,330,400,465,483,530,600,760,1000];
function cardsFor(layout,teams){
 const lanes=getArenaLaneLayout(teams),cards=[];
 teams.forEach((team,side)=>{const next={front:0,back:0};team.forEach(unit=>{
  const row=lanes.teams[side][unit.lane][next[unit.lane]++],[start,span]=row.split(' / span ').map(Number);
  const column=side?(unit.lane==='front'?2:3):(unit.lane==='front'?1:0);
  const x=layout.centers[column],y=layout.gridTop+(start-1+span/2)*layout.gridHeight/ARENA_LANE_TRACKS;
  const height=Math.max(0,Math.min(90,span*layout.gridHeight/ARENA_LANE_TRACKS-3));
  const portrait=Math.min(64,layout.cardWidth,Math.max(0,height-26));
  cards.push({side,id:unit.id,row,span,x,y,height,portrait,target:[x-layout.cardWidth/2,y-height/2,x+layout.cardWidth/2,y+height/2]});
 });});return cards;
}
test('full square source is proportionally contained and centered across phone, short landscape and desktop',()=>{
 for(const width of WIDTHS)for(const height of HEIGHTS){
  const layout=computeVikingLayout(width,height),scale=Math.min(width/1254,height/1254);assert.ok(layout);
  assert.equal(layout.width,width);assert.equal(layout.height,height);close(layout.art.width,1254*scale);close(layout.art.height,1254*scale);
  close(layout.art.height/layout.art.width,1);close(layout.art.left,(width-layout.art.width)/2);close(layout.art.top,(height-layout.art.height)/2);
  assert.ok(layout.art.left>=-EPS&&layout.art.top>=-EPS);assert.ok(layout.art.left+layout.art.width<=width+EPS&&layout.art.top+layout.art.height<=height+EPS);
  assert.ok(Math.abs(layout.art.width-width)<EPS||Math.abs(layout.art.height-height)<EPS,'contain must meet one existing arena dimension');
 }
});
test('four fixed columns use a readable bounded field while the background alone remains contained',()=>{
 for(const width of WIDTHS)for(const height of HEIGHTS){
  const l=computeVikingLayout(width,height),fieldWidth=Math.min(width,Math.max(l.art.width,348)),fieldLeft=(width-fieldWidth)/2,pitch=fieldWidth/4;
  close(l.cardWidth,Math.min(84,pitch-3));assert.ok(l.cardWidth>=61&&l.cardWidth<=84);
  for(let i=0;i<4;i++)close(l.centers[i],fieldLeft+(i+.5)*pitch);
  close(l.teamWidth,pitch+l.cardWidth);close(l.columnGap,pitch-l.cardWidth);assert.ok(l.columnGap>=3-EPS);
  close(l.blueLeft,l.centers[0]-l.cardWidth/2);close(l.redLeft,l.centers[2]-l.cardWidth/2);
  close(l.gridHeight,Math.min(465,height-12));close(l.gridTop,(height-l.gridHeight)/2);
 }
 const short=computeVikingLayout(428,180);assert.ok(short.art.width<348);close(short.centers[3]-short.centers[0],261);
});
test('all 36 distributions in 143 viewport sizes keep all targets separate and within the unchanged arena',()=>{
 let checked=0;
 for(const width of WIDTHS)for(const height of HEIGHTS){const l=computeVikingLayout(width,height);
  for(let a=0;a<=5;a++)for(let b=0;b<=5;b++){
   const cards=cardsFor(l,teamsFor(a,b));assert.equal(cards.length,10);
   for(const c of cards){const [x1,y1,x2,y2]=c.target;assert.ok(c.height>0&&c.height<=90);assert.ok(c.portrait>=0&&c.portrait<=64&&c.portrait<=l.cardWidth);
    assert.ok(x1>=-EPS&&y1>=-EPS&&x2<=width+EPS&&y2<=height+EPS,JSON.stringify({width,height,a,b,c}));checked++;}
   for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const aa=cards[i].target,bb=cards[j].target;
    assert.ok(Math.min(aa[2],bb[2])-Math.max(aa[0],bb[0])<=EPS||Math.min(aa[3],bb[3])-Math.max(aa[1],bb[1])<=EPS,JSON.stringify({width,height,a,b,first:cards[i],second:cards[j]}));}
  }
 }
 assert.equal(checked,WIDTHS.length*HEIGHTS.length*36*10);
});
test('per-lane cards never shrink below either previous padding mode; short screens gain no false 44px guarantee',()=>{
 for(const width of WIDTHS)for(const height of HEIGHTS){const l=computeVikingLayout(width,height);
  for(let a=0;a<=5;a++)for(let b=0;b<=5;b++)for(const card of cardsFor(l,teamsFor(a,b))){
   for(const inset of [18,12]){const previous=Math.max(0,Math.min(90,card.span*(height-inset)/ARENA_LANE_TRACKS-3));assert.ok(card.height>=previous-EPS,'must retain normal and max-height600 compact budgets');}
  }
 }
 const shortest=cardsFor(computeVikingLayout(256,180),teamsFor(5,5));assert.ok(shortest.every(c=>c.height<44));
 const reference=cardsFor(computeVikingLayout(378,530),teamsFor(5,5));assert.ok(reference.every(c=>c.height===90&&c.portrait===64));
});
test('defeat and revival preserve hero identity, source row assignment and all presentation positions',()=>{
 const l=computeVikingLayout(428,530);
 for(let a=0;a<=5;a++)for(let b=0;b<=5;b++){
  const teams=teamsFor(a,b),snapshot=structuredClone(teams),positions=cardsFor(l,teams);assert.deepEqual(teams,snapshot);
  teams[0][0].hp=0;teams[1][4].hp=0;assert.deepEqual(cardsFor(l,teams),positions);teams[0][0].hp=50;assert.deepEqual(cardsFor(l,teams),positions);
 }
});
test('invalid or unmeasurable inputs fail closed, while the documented >18 boundary remains finite',()=>{
 for(const args of [[0,0],[255.99,530],[256,18],[256,0],[256,-1],[Infinity,530],[NaN,530],[256,Infinity],[256,NaN]])assert.equal(computeVikingLayout(...args),null);
 for(const args of [[256,18.01],[256,19],[1138,1000]]){
  const l=computeVikingLayout(...args);assert.ok(l);assert.ok(l.gridHeight>0);assert.ok(Object.values(l.art).every(Number.isFinite));
  assert.ok(l.art.left>=-EPS&&l.art.top>=-EPS&&l.art.left+l.art.width<=l.width+EPS&&l.art.top+l.art.height<=l.height+EPS);
 }
});
function fixture({theme='fjord',width=378,height=530,hidden=false,observerFailure='',before={},prioritiesBefore={},marker=null,observer=true}={}){
 const attrs=new Map(marker===null?[]:[['data-viking-layout',marker]]),values=new Map(Object.entries(before)),priorities=new Map(Object.entries(prioritiesBefore));
 const children=[{id:'existing-team-a'},{id:'existing-team-b'}];let writes=0,attrWrites=0,disconnections=0,constructions=0,notify;
 const root={dataset:{arenaTheme:theme},clientWidth:width,clientHeight:height,hidden,isConnected:true,children,
  style:{getPropertyValue:k=>values.get(k)||'',getPropertyPriority:k=>priorities.get(k)||'',setProperty(k,v,p=''){values.set(k,v);priorities.set(k,p);writes++;},removeProperty(k){values.delete(k);priorities.delete(k);}},
  getAttribute:k=>attrs.get(k)??null,setAttribute(k,v){attrs.set(k,v);attrWrites++;},removeAttribute:k=>attrs.delete(k)};
 class ResizeObserver{constructor(fn){constructions++;if(observerFailure==='constructor')throw Error('observer constructor');notify=fn;}observe(node){assert.equal(node,root);if(observerFailure==='observe')throw Error('observer registration');}disconnect(){disconnections++;}}
 const options=observer?{ResizeObserver}:{},controller=mountVikingLayout(root,options);
 return {root,values,priorities,attrs,children,options,controller,writes:()=>writes,attrWrites:()=>attrWrites,disconnections:()=>disconnections,constructions:()=>constructions,resize:()=>notify?.()};
}
test('Viking mounts idempotently with one bounded observer and no hero DOM rewrite',()=>{
 for(const theme of ['fjord']){
  const f=fixture({theme});assert.equal(f.controller.state().active,true);assert.equal(f.attrs.get('data-viking-layout'),'ready');assert.ok(f.values.size>0);
  assert.ok([...f.values.keys()].every(k=>k.startsWith('--arena-viking-')));const writes=f.writes(),attrWrites=f.attrWrites();
  for(let i=0;i<50;i++){assert.equal(mountVikingLayout(f.root,f.options),f.controller);f.resize();f.controller.refresh();}
  assert.equal(f.writes(),writes);assert.equal(f.attrWrites(),attrWrites);assert.equal(f.constructions(),1);assert.equal(f.root.children,f.children);f.controller.dispose();assert.equal(f.disconnections(),1);
 }
});
test('Non-Viking themes remain no-op, including preexisting styles and attributes',()=>{
 for(const theme of ['ruins','savanna','courtyard','space','orbit',null,'','fjord<script>']){
  const before={'--other-presentation':'19px','--arena-viking-grid-top':'12px'},f=fixture({theme,before});for(let i=0;i<4;i++)f.resize();
  assert.equal(f.controller.state().active,false);assert.deepEqual(Object.fromEntries(f.values),before);assert.equal(f.attrs.size,0);assert.equal(f.writes(),0);f.controller.dispose();
 }
});
test('theme changes, hide/show and disposal restore previous scoped styles including priorities',()=>{
 const before={'--arena-viking-grid-top':'old','--other-presentation':'safe'},prioritiesBefore={'--arena-viking-grid-top':'important'},f=fixture({before,prioritiesBefore,marker:'previous'});
 f.root.dataset.arenaTheme='ruins';f.controller.refresh();assert.deepEqual(Object.fromEntries(f.values),before);assert.equal(f.priorities.get('--arena-viking-grid-top'),'important');assert.equal(f.attrs.get('data-viking-layout'),'previous');
 f.root.dataset.arenaTheme='fjord';f.controller.refresh();assert.equal(f.controller.state().active,true);f.root.hidden=true;f.resize();assert.deepEqual(Object.fromEntries(f.values),before);
 f.root.hidden=false;f.root.clientWidth=850;f.root.clientHeight=400;f.controller.refresh();assert.equal(f.controller.state().layout.width,850);assert.equal(f.controller.state().layout.height,400);
 f.controller.dispose();f.controller.dispose();f.resize();assert.deepEqual(Object.fromEntries(f.values),before);assert.equal(f.priorities.get('--arena-viking-grid-top'),'important');assert.equal(f.attrs.get('data-viking-layout'),'previous');assert.equal(f.disconnections(),1);
});
test('disposal preserves later ownership edits and a fresh mount can take over cleanly',()=>{
 const f=fixture();f.values.set('--arena-viking-grid-top','new-owner');f.attrs.set('data-viking-layout','new-owner');f.controller.dispose();f.controller.dispose();f.resize();
 assert.equal(f.values.get('--arena-viking-grid-top'),'new-owner');assert.equal(f.attrs.get('data-viking-layout'),'new-owner');assert.equal(f.disconnections(),1);assert.equal(f.controller.state().disposed,true);
 const next=mountVikingLayout(f.root,f.options);assert.notEqual(next,f.controller);assert.equal(next.state().active,true);next.dispose();assert.equal(f.values.get('--arena-viking-grid-top'),'new-owner');assert.equal(f.attrs.get('data-viking-layout'),'new-owner');
});
test('zero-size, initially hidden, detached and invalid-height roots recover through explicit refresh',()=>{
 for(const config of [{width:0},{hidden:true},{height:18}]){
  const f=fixture(config);assert.equal(f.controller.state().active,false);f.root.clientWidth=378;f.root.clientHeight=530;f.root.hidden=false;f.controller.refresh();assert.equal(f.controller.state().active,true);
  f.root.isConnected=false;f.resize();assert.equal(f.controller.state().active,false);assert.equal(f.values.size,0);f.root.isConnected=true;f.controller.refresh();assert.equal(f.controller.state().active,true);f.controller.dispose();
 }
});
test('missing or failed observers remain optional and cannot leak a partially registered observer',()=>{
 for(const config of [{observer:false},{observerFailure:'constructor'},{observerFailure:'observe'}]){
  const f=fixture(config);assert.equal(f.controller.state().active,true);f.root.clientWidth=308;f.controller.refresh();assert.equal(f.controller.state().layout.width,308);
  f.controller.dispose();assert.equal(f.disconnections(),config.observer===false||config.observerFailure==='constructor'?0:1);assert.equal(f.values.size,0);
 }
});
test('measurement errors restore presentation instead of propagating into combat',()=>{
 const f=fixture();Object.defineProperty(f.root,'clientWidth',{get(){throw Error('detached measurement');}});assert.doesNotThrow(()=>f.controller.refresh());assert.equal(f.controller.state().active,false);assert.equal(f.values.size,0);f.controller.dispose();
});
test('source has no clocks, combat imports, randomness, DOM replacement or scroll effects',()=>{
 const js=readFileSync(new URL('../public/arena-viking-layout.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(|Math\.random\s*\(|battle-engine|replaceChildren|innerHTML|outerHTML|append\s*\(|scrollTo\s*\(|scrollIntoView\s*\(/);
 assert.throws(()=>mountVikingLayout(null),TypeError);assert.throws(()=>mountVikingLayout({}),TypeError);
});

test('Viking ground CSS has no forced height, crop, cliff or rim and keeps compact lane rules',()=>{
 const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8').split('/* Viking ground-level square composition:')[1].split('/* End Viking wide-floor layout. */')[0];
 assert.doesNotMatch(css,/minmax\(530px|background-size:cover|\.shell|box-shadow:0|fjord-premium/);
 assert.match(css,/fjord-ground-v2\.webp/);assert.match(css,/background-size:var\(--arena-viking-art-width\) var\(--arena-viking-art-height\)/);
 assert.match(css,/grid-template-rows:repeat\(60,minmax\(0,1fr\)\)/);
 assert.match(css,/max-height:90px;min-height:0/);
});
