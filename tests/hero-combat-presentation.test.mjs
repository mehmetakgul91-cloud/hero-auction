import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as T from 'three';
import {combatEffectKind,combatEffectActors,createCombatEffects} from '../public/arena-combat-effects.js';
import {heroCombatPresentation,stationaryArenaAction} from '../public/hero-combat-presentation.js';
import {Arena3dScene} from '../public/arena-3d-scene.js';
import {createHeroModel,homePosition} from '../public/arena-3d-models.js';

const stationary=[{id:'healer',role:'support'},{id:'mage',role:'energy'},{id:'original:08',role:'fighter'},{id:'original:13',role:'fighter'}];
test('ranged heroes keep their world position for normal and special attacks in the real 3D animator',()=>{
 for(const hero of [...stationary,{id:'warrior',role:'fighter'},{id:'rogue',role:'assassin'}])for(const damageType of ['normal','special']){
  const scene=Object.create(Arena3dScene.prototype);
  Object.assign(scene,{scene:new T.Scene(),camera:new T.OrthographicCamera(-6,6,6,-6,.1,100),renderer:{render(){}},width:800,height:600,time:0,reduced:false,models:new Map(),effects:[],winner:null});
  const targetHero={id:'target',role:'tank',hp:100,maxHp:100};
  for(const [side,h] of [{...hero,hp:100,maxHp:100},targetHero].entries()){
   const m=createHeroModel(h,side);m.base.copy(homePosition(side,side?0:3));m.root.position.copy(m.base);
   m.label={style:{},classList:{toggle(){}}};m.fill={style:{}};scene.models.set(m.key,m);scene.scene.add(m.root);
  }
  const actor=scene.models.get('0:'+hero.id);
  scene.startFrame({events:[{side:0,actor:hero.id,target:'target',action:'attack',damageType}],teams:[]});
  let greatestDistance=0;
  for(let step=0;step<=20;step++){
   scene.render(.025,step/20);greatestDistance=Math.max(greatestDistance,actor.root.position.distanceTo(actor.base));
   if(stationary.includes(hero))assert.ok(actor.root.position.distanceTo(actor.base)<1e-9,hero.id+' must stay in its cell');
  }
  if(stationary.includes(hero))assert.ok(scene.active.projectile,'ranged attacks must reach the target as a projectile');
  else assert.ok(greatestDistance>1,'melee attacker must approach its target');
  scene.finishFrame();
 }
});

test('healing stays in place even for a normally melee hero',()=>{
 assert.equal(stationaryArenaAction({id:'warrior',role:'fighter'},{action:'heal'}),true);
 assert.equal(heroCombatPresentation({id:'original:13',role:'fighter'}).projectile,'arrow');
});

test('classic arena applies the same range rule to the actual animation calls',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function animateMove(e){'),source.indexOf("window.addEventListener('heroarena:experimental-move'"));
 for(const h of [...stationary,{id:'warrior',role:'fighter'}]){
  const animations=[],classes=[];
  const element=()=>({dataset:{},style:{setProperty(){}},classList:{add(...v){classes.push(...v)},remove(){}},append(){},remove(){},querySelector(){return null},setAttribute(){},getBoundingClientRect(){return {left:0,top:0,width:80,height:100}},animate(frames){animations.push(frames)}});
  const actor=element(),target=element();actor.dataset={heroId:h.id,role:h.role};target.dataset.heroId='target';target.animate=()=>{};target.getBoundingClientRect=()=>({left:300,top:120,width:80,height:100});
  const document={querySelectorAll:()=>[actor,target],createElement:element,body:{append(){}}};
  const combatEffects=createCombatEffects({document,setTimer(){},clearTimer(){}});
  const context=vm.createContext({combatEffectKind,combatEffectActors,combatEffects,heroCombatPresentation,stationaryArenaAction,motion:()=>true,comicBattleCue(){},duration:()=>600,setTimeout(){},floatingArenaEffect(){},document:{querySelectorAll:()=>[actor,target],createElement:element,body:{append(){}}}});
  vm.runInContext(code+';animateMove('+JSON.stringify({actorId:h.id,targetId:'target',action:'attack',value:15})+');',context);
  if(stationary.includes(h)){
   assert.ok(classes.includes('attack-energy'),h.id);
   assert.ok(animations.every(frames=>frames.every(f=>!f.transform)),'ranged actor must never receive a travel transform');
  }else assert.ok(animations.some(frames=>frames.some(f=>f.transform?.includes('231'))));
 }
});
