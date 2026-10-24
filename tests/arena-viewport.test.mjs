import test from 'node:test';
import assert from 'node:assert/strict';
import {mountArenaViewport,getArenaLaneLayout} from '../public/arena-viewport.js';

test('normal formations use three rows and every lane arrangement fits without collisions',()=>{
 const team=front=>Array.from({length:5},(_,i)=>({lane:i<front?'front':'back'}));
 assert.deepEqual(getArenaLaneLayout([team(2),team(2)]),{rows:3,teams:[{front:[1,3],back:[1,2,3]},{front:[1,3],back:[1,2,3]}]});
 for(let a=0;a<=5;a++)for(let b=0;b<=5;b++){
  const layout=getArenaLaneLayout([team(a),team(b)]);
  assert.equal(layout.rows,Math.max(a,5-a,b,5-b));
  for(const [side,front] of [a,b].entries()){
   for(const [lane,count] of [['front',front],['back',5-front]]){
    const positions=layout.teams[side][lane];
    assert.equal(positions.length,count);
    assert.equal(new Set(positions).size,count);
    assert.ok(positions.every(row=>row>=1&&row<=layout.rows));
   }
  }
 }
});

function fixture({width=390,height=700}={}){
 const classes=new Set(),properties=new Map(),frames=new Map(),scrolls=[];
 const body={classList:{contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name),remove:name=>classes.delete(name)}};
 const arena={hidden:true},root={style:{setProperty:(key,value)=>properties.set(key,value),removeProperty:key=>properties.delete(key)}};
 let notify,id=0,disconnected=false;
 const viewport=Object.assign(new EventTarget(),{height,scale:1});
 const window=Object.assign(new EventTarget(),{visualViewport:viewport,innerWidth:width,innerHeight:height+100,
  MutationObserver:class{constructor(fn){notify=fn;}observe(){}disconnect(){disconnected=true;}},
  requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key),scrollTo:options=>scrolls.push(options)});
 const document={body,documentElement:root,getElementById:()=>arena};
 const destroy=mountArenaViewport({window,document});
 const flush=()=>{for(const [id,fn]of [...frames]){frames.delete(id);fn();}};
 return {window,viewport,properties,classes,arena,frames,scrolls,destroy,flush,
  enter(){classes.add('arena-room');arena.hidden=false;notify();flush();},
  finish(){arena.hidden=true;notify();flush();},
  disconnected:()=>disconnected};
}

test('battle uses the visible phone height and resets preparation scrolling once',()=>{
 for(const [width,height]of [[320,480],[360,600],[390,700],[430,780],[844,330]]){
  const h=fixture({width,height});
  assert.equal(h.classes.has('arena-fit'),false);
  h.enter();
  assert.equal(h.properties.get('--arena-viewport-height'),height+'px');
  assert.equal(h.classes.has('arena-fit'),true);
  assert.deepEqual(h.scrolls,[{top:0,left:0,behavior:'instant'}]);
  h.viewport.height=height-60;
  h.viewport.dispatchEvent(new Event('resize'));
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(h.frames.size,1);
  h.flush();
  assert.equal(h.properties.get('--arena-viewport-height'),height-60+'px');
  assert.equal(h.scrolls.length,1);
  h.destroy();
 }
});

test('results release the fixed layout and a rematch can fit the screen again',()=>{
 const h=fixture();h.enter();h.finish();
 assert.equal(h.classes.has('arena-fit'),false);
 assert.equal(h.properties.has('--arena-viewport-height'),false);
 h.viewport.dispatchEvent(new Event('resize'));h.flush();
 assert.equal(h.properties.has('--arena-viewport-height'),false);
 h.enter();assert.equal(h.classes.has('arena-fit'),true);
 assert.equal(h.scrolls.length,2);
 h.destroy();assert.equal(h.disconnected(),true);
 assert.equal(h.classes.has('arena-fit'),false);
 h.viewport.dispatchEvent(new Event('resize'));
 assert.equal(h.frames.size,0);
});

test('pinch zoom keeps the full layout instead of shrinking the controls',()=>{
 const h=fixture();h.enter();
 h.viewport.scale=2;h.viewport.height=300;
 h.viewport.dispatchEvent(new Event('resize'));h.flush();
 assert.equal(h.properties.get('--arena-viewport-height'),h.window.innerHeight+'px');
 h.destroy();
});
