import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroHealthMeter} from '../public/hero-health-meter.js';
import {Arena3dScene} from '../public/arena-3d-scene.js';
for(const hp of [0,19,19.9,20,21,100])test(`unrounded HP threshold: ${hp}%`,()=>{
 const meter=heroHealthMeter({hp,maxHp:100});
 assert.equal(meter.low,hp>0&&hp<20);assert.ok(Math.abs(meter.percent-hp)<1e-10);
});
test('invalid maximum and HP are safe; over-heal is capped for display only',()=>{
 for(const maxHp of [0,-1,NaN,Infinity,undefined])assert.deepEqual(heroHealthMeter({hp:1,maxHp}),{percent:0,low:false});
 for(const hp of [NaN,Infinity,undefined,-1])assert.deepEqual(heroHealthMeter({hp,maxHp:100}),{percent:0,low:false});
 const unit={hp:120,maxHp:100};assert.deepEqual(heroHealthMeter(unit),{percent:100,low:false});assert.equal(unit.hp,120);
 assert.equal(heroHealthMeter({hp:199,maxHp:1000}).low,true);
});
test('3D replay updates both teams, heals out of warning and preserves death visibility',()=>{
 const scene=Object.create(Arena3dScene.prototype);scene.models=new Map();
 const node=()=>({style:{},classes:new Set(),classList:{toggle(name,on){on?this.owner.classes.add(name):this.owner.classes.delete(name);}}});
 for(const side of [0,1]){
  const label=node(),fill=node();label.classList.owner=label;fill.classList.owner=fill;
  scene.models.set(side+':same',{side,hero:{id:'same'},label,fill,bubble:{}});
 }
 for(const hp of [100,19.9,20,19,0,21,19,100]){
  scene.setTeams([0,1].map(()=>[{id:'same',hp,maxHp:100}]));
  for(const model of scene.models.values()){
   assert.equal(model.fill.classes.has('low-health'),hp>0&&hp<20);
   assert.equal(model.label.classes.has('dead'),hp===0);
   assert.ok(!model.fill.style.transform.includes('NaN'));
  }
 }
});
test('warning styles are hero-only, static, and override the existing green without team color conflicts',()=>{
 const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
 assert.match(css,/\.arena-hero \.hp\.low-health span\{background:linear-gradient\(90deg,#e73345,#ff7180\)\}/);
 const scene=readFileSync(new URL('../public/arena-3d.css',import.meta.url),'utf8');
 assert.doesNotMatch(scene,/\.hero-label\.red \.health-fill/);
 assert.match(scene,/\.hero-label \.health-fill\.low-health\{background:#e73345\}/);
});
