import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VIKING_LAYOUT,computeVikingLayout,mountVikingLayout} from '../public/arena-viking-layout.js';
import {getArenaLaneLayout,ARENA_LANE_TRACKS} from '../public/arena-viewport.js';
const EPS=1e-6;
const close=(a,b)=>assert.ok(Math.abs(a-b)<EPS,`${a} ≠ ${b}`);
const teamsFor=(a,b)=>[a,b].map(front=>Array.from({length:5},(_,i)=>({id:i,lane:i<front?'front':'back',hp:100})));
function cardsFor(layout,teams){
 const lanes=getArenaLaneLayout(teams),cards=[];
 teams.forEach((team,side)=>{const next={front:0,back:0};team.forEach(unit=>{
  const row=lanes.teams[side][unit.lane][next[unit.lane]++], [start,span]=row.split(' / span ').map(Number);
  const column=side?(unit.lane==='front'?2:3):(unit.lane==='front'?1:0);
  const x=layout.centers[column],y=layout.gridTop+(start-1+span/2)*layout.gridHeight/ARENA_LANE_TRACKS;
  cards.push({side,id:unit.id,row,x,y,target:[x-layout.cardWidth/2,y-45,x+layout.cardWidth/2,y+45],visible:[x-32,y-45,x+32,y+45]});
 });});return cards;
}
const SIZES=[[308,530],[318,530],[348,530],[360,530],[378,530],[390,600],[418,760],[576,220],[700,330],[850,530],[850,800],[1138,1000],[308,300],[288,530]];
test('approved 378×530 mapping exactly matches all phone mock coordinates and proportional artwork',()=>{
 const l=computeVikingLayout(378,530);assert.deepEqual(l.centers,[62,147,231,316]);assert.equal(l.cardWidth,84);assert.equal(l.cardHeight,90);assert.equal(l.portraitSize,64);assert.deepEqual(l.art,{left:0,top:-18.5,width:378,height:567});
 assert.equal(l.gridTop,6.5);assert.equal(l.gridHeight,465);
 assert.deepEqual(cardsFor(l,teamsFor(5,5)).slice(0,5).map(c=>c.y),[53,146,239,332,425]);
 assert.deepEqual(cardsFor(l,teamsFor(2,2)).slice(0,5).map(c=>c.y),[122.75,355.25,84,239,394]);
});
test('all 36 distributions across phone, short landscape and desktop keep every target separate and on stage',()=>{
 let checked=0;
 for(const [width,height]of SIZES){const l=computeVikingLayout(width,height);assert.ok(l);assert.ok(l.cardWidth>=64&&l.cardWidth<=84);assert.equal(l.portraitSize,64);assert.equal(l.cardHeight,90);
  for(let a=0;a<=5;a++)for(let b=0;b<=5;b++){
   const cards=cardsFor(l,teamsFor(a,b));assert.equal(cards.length,10);
   for(const c of cards){const [x1,y1,x2,y2]=c.target;assert.ok(x1>=-EPS&&y1>=-EPS&&x2<=l.width+EPS&&y2<=l.height+EPS,JSON.stringify({width,height,a,b,c}));checked++;}
   for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i].target,b=cards[j].target;assert.ok(Math.min(a[2],b[2])-Math.max(a[0],b[0])<=EPS||Math.min(a[3],b[3])-Math.max(a[1],b[1])<=EPS,'overlapping hero targets');}
  }
 }
 assert.equal(checked,5040);
});
test('64px portraits and both meter footprints remain within the conservative mapped flat floor in all 504 cases',()=>{
 for(const [width,height]of SIZES){const l=computeVikingLayout(width,height);
  close(l.art.height/l.art.width,1.5);assert.ok(l.floor.bottom<l.mistTop);assert.ok(l.mistTop<l.height,'some lower cliff remains visible');
  for(let a=0;a<=5;a++)for(let b=0;b<=5;b++)for(const c of cardsFor(l,teamsFor(a,b))){const [x1,y1,x2,y2]=c.visible;assert.ok(x1>=l.floor.left-EPS&&y1>=l.floor.top-EPS&&x2<=l.floor.right+EPS&&y2<=l.floor.bottom+EPS,JSON.stringify({width,height,a,b,c,floor:l.floor}));}
 }
});
test('defeat and revival never change lane assignment, position, identity or geometry',()=>{
 const l=computeVikingLayout(378,530);
 for(let a=0;a<=5;a++)for(let b=0;b<=5;b++){
  const teams=teamsFor(a,b),before=structuredClone(teams),positions=cardsFor(l,teams);assert.deepEqual(teams,before);
  teams[0][0].hp=0;teams[1][4].hp=0;assert.deepEqual(cardsFor(l,teams),positions);
  teams[0][0].hp=60;assert.deepEqual(cardsFor(l,teams),positions);
 }
});
test('narrow width changes transparent boxes only; short screens choose height rather than tiny portraits',()=>{
 const narrow=computeVikingLayout(308,230);close(narrow.cardWidth,84*308/378);assert.equal(narrow.height,530);assert.equal(narrow.portraitSize,64);assert.equal(narrow.cardHeight,90);assert.equal(narrow.art.width,378);
 const desktop=computeVikingLayout(850,530);assert.equal(desktop.art.width,378);assert.equal(desktop.art.left,236);assert.equal(desktop.art.top,-18.5);assert.equal(desktop.cardWidth,84);
});
test('invalid/unmeasurable roots fail closed without impossible overlap geometry',()=>{
 for(const args of [[0,0],[287,530],[378,0],[Infinity,530],[NaN,530],[378,Infinity],[378,-1]])assert.equal(computeVikingLayout(...args),null);
});
function fixture({theme='fjord',width=378,height=530,hidden=false,observerFailure='',before={}}={}){
 const attrs=new Map(),values=new Map(Object.entries(before)),priorities=new Map(),children=[{id:'existing-team-a'},{id:'existing-team-b'}];let writes=0,attrWrites=0,disconnections=0,notify;
 const root={dataset:{arenaTheme:theme},clientWidth:width,clientHeight:height,hidden,isConnected:true,children,
  style:{getPropertyValue:k=>values.get(k)||'',getPropertyPriority:k=>priorities.get(k)||'',setProperty(k,v,p=''){values.set(k,v);priorities.set(k,p);writes++;},removeProperty(k){values.delete(k);priorities.delete(k);}},
  getAttribute:k=>attrs.get(k)??null,setAttribute(k,v){attrs.set(k,v);attrWrites++;},removeAttribute:k=>attrs.delete(k)};
 class ResizeObserver{constructor(fn){if(observerFailure==='constructor')throw Error('observer');notify=fn;}observe(node){assert.equal(node,root);if(observerFailure==='observe')throw Error('observe');}disconnect(){disconnections++;}}
 const options={ResizeObserver},controller=mountVikingLayout(root,options);
 return {root,values,attrs,children,options,controller,writes:()=>writes,attrWrites:()=>attrWrites,disconnections:()=>disconnections,resize:()=>notify?.()};
}
test('idempotent mount uses one bounded observer and only writes scoped properties; it never replaces hero DOM',()=>{
 const f=fixture();assert.equal(f.controller.state().active,true);assert.equal(f.attrs.get('data-viking-layout'),'ready');assert.equal(f.values.get('--arena-viking-grid-top'),'6.5px');assert.ok([...f.values.keys()].every(k=>k.startsWith('--arena-viking-')));
 const writes=f.writes(),attrs=f.attrWrites();for(let i=0;i<50;i++){assert.equal(mountVikingLayout(f.root,f.options),f.controller);f.resize();f.controller.refresh();}
 assert.equal(f.writes(),writes);assert.equal(f.attrWrites(),attrs);assert.equal(f.root.children,f.children);f.controller.dispose();assert.equal(f.disconnections(),1);
});
test('forest and savanna are exact no-op layouts, including all initial style values',()=>{
 for(const theme of ['ruins','savanna','courtyard','orbit',null,'']){const before={'--other-presentation':'19px','--arena-viking-grid-top':'12px'},f=fixture({theme,before});for(let i=0;i<4;i++)f.resize();assert.equal(f.controller.state().active,false);assert.deepEqual(Object.fromEntries(f.values),before);assert.equal(f.attrs.size,0);assert.equal(f.writes(),0);f.controller.dispose();}
});
test('changing theme/visibility, rematching and disposal restore properties without corrupting other owners',()=>{
 const before={'--arena-viking-grid-top':'old','--other-presentation':'safe'},f=fixture({before});
 f.root.dataset.arenaTheme='ruins';f.controller.refresh();assert.deepEqual(Object.fromEntries(f.values),before);assert.equal(f.attrs.size,0);
 f.root.dataset.arenaTheme='fjord';f.controller.refresh();assert.equal(f.controller.state().active,true);f.root.hidden=true;f.resize();assert.deepEqual(Object.fromEntries(f.values),before);
 f.root.hidden=false;f.root.clientWidth=850;f.root.clientHeight=800;f.controller.refresh();assert.equal(f.controller.state().layout.width,850);
 f.values.set('--arena-viking-grid-top','new-owner');f.controller.dispose();f.controller.dispose();f.resize();assert.equal(f.values.get('--arena-viking-grid-top'),'new-owner');assert.equal(f.values.get('--other-presentation'),'safe');assert.equal(f.disconnections(),1);assert.equal(f.attrs.size,0);
 const next=mountVikingLayout(f.root,f.options);assert.notEqual(next,f.controller);next.dispose();
});
test('zero-size, detached and initially hidden roots can recover without background timers',()=>{
 for(const config of [{width:0},{hidden:true}]){const f=fixture(config);assert.equal(f.controller.state().active,false);f.root.clientWidth=378;f.root.hidden=false;f.controller.refresh();assert.equal(f.controller.state().active,true);f.root.isConnected=false;f.resize();assert.equal(f.controller.state().active,false);assert.equal(f.values.size,0);f.controller.dispose();}
});
test('missing/throwing ResizeObserver still gives explicit refresh and clean disposal',()=>{
 for(const observerFailure of ['constructor','observe']){const f=fixture({observerFailure});assert.equal(f.controller.state().active,true);f.root.clientWidth=308;f.controller.refresh();assert.equal(f.controller.state().layout.width,308);f.controller.dispose();assert.equal(f.disconnections(),observerFailure==='observe'?1:0);assert.equal(f.values.size,0);}
});
test('CSS changes only selected fjord, protects no-shrink portraits and retains zero-gap 60-track rows',()=>{
 const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8').split('/* Viking wide-floor layout:')[1].split('/* Viking snow:')[0];
 for(const selector of css.matchAll(/([^{}]+)\{/g)){if(selector[1].trim().startsWith('@'))continue;assert.match(selector[1],/data-arena-theme="fjord"/);}
 assert.match(css,/grid-template-rows:repeat\(60,minmax\(0,1fr\)\);row-gap:0/);
 assert.match(css,/grid-template-rows:64px 11px 5px 4px/);assert.match(css,/width:64px;height:64px;min-width:64px;min-height:64px/);assert.match(css,/minmax\(530px,1fr\)/);assert.match(css,/minmax\(486px,1fr\)/);
 assert.doesNotMatch(css,/overflow[-a-z]*:\s*hidden|touch-action:|pointer-events:|background-size:cover|transform:|filter:|animation:/);
 const js=readFileSync(new URL('../public/arena-viking-layout.js',import.meta.url),'utf8');assert.doesNotMatch(js,/setTimeout\(|setInterval\(|requestAnimationFrame\(|querySelector|replaceChildren|append\(|battle-engine|Math\.random/);
});
