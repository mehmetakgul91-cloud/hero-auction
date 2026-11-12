import test from 'node:test';
import assert from 'node:assert/strict';
import {battleRoster} from '../battle-roster.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {abilityImpact} from '../public/hero-ability-text.js';

const rates = [
 ['Demir Sur',25,7], ['Brunn',29,8], ['Çan Muhafızı',30,8], ['Kara Siper',30,8],
 ['Kaya Titanı',32,8], ['Kadim Meşe',33,8], ['Buz Kalesi',34,8],
 ['Obsidyen Muhafız',39,9], ['Altın Muhafız',39,10], ['Drogar',40,9]
];

function unit(id,position,extra={}){
 return {id,position,hp:1000,maxHp:1000,attack:100,defense:100,shield:0,role:'fighter',lane:'front',...extra};
}

function cast(active,lane,defense){
 const actor=unit('caster',0,{role:'tank',lane,active,defense});
 const team=[actor,unit('other-tank',1,{role:'tank'}),unit('fighter',2),unit('back',3,{lane:'back'}),unit('fallen',4,{hp:0})];
 const combat=createLiveCommanderCombat({
  round:3,abilities:createLiveCommanderAbilities({matchKey:'tank-shields'}),
  teams:[team,[unit('enemy',0)]],commanders:[{commanderId:'attack'},{commanderId:'defense'}]
 });
 return stepParityShieldDrain(combat,{side:0,actorId:actor.id});
}

for(const [name,self,front] of rates){
 const hero=battleRoster.find(kit=>kit.name===name);
 for(const lane of ['front','back']) for(const defense of [1,37,100,145]){
  test(name+' casts in '+lane+' with '+defense+' defense',()=>{
   const result=cast(hero.active,lane,defense);
   const ownAmount=Math.round(defense*self/100),allyAmount=Math.max(1,Math.round(defense*front/100));
   assert.deepEqual(result.teams[0].map(unit=>unit.shield),[ownAmount,allyAmount,allyAmount,0,0]);
   const shields=result.events.filter(e=>['shield','tank-front-shield','tank-self-shield'].includes(e.action));
   assert.deepEqual(shields.map(e=>[e.target,e.value]),[['caster',ownAmount],['other-tank',allyAmount],['fighter',allyAmount]]);
   for(const compact of [true,false]) for(const english of [true,false]){
    const description=abilityImpact(hero.active,{compact,english});
    assert.deepEqual(description.match(/\d+/g).map(Number),[3,self,front]);
   }
  });
 }
}

test('a previously captured tank kit retains its distribution and description',()=>{
 const active={name:'buz-alan-hasari',effect:'shield',power:1.14,shieldRate:.45,frontShieldRate:.18,tankShieldRate:.20};
 assert.deepEqual(cast(active,'front',100).teams[0].map(u=>u.shield),[83,18,18,0,0]);
 assert.deepEqual(cast(active,'back',100).teams[0].map(u=>u.shield),[65,18,18,0,0]);
 assert.match(abilityImpact(active,{english:true}),/extra self shield for 20%/);
});
