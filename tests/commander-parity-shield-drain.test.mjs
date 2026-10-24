import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
function make(effect){
 const hero=(id,hp,active=null)=>({id,hp,maxHp:100,attack:100,defense:50,shield:0,role:'fighter',lane:'front',position:0,active});
 return createLiveCommanderCombat({round:3,abilities:createLiveCommanderAbilities({matchKey:'special:1',energy:[0,0],now:1000}),teams:[[hero('a',60,{effect,name:'Ability'})],[hero('b',100)]],commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
}
test('shield special damages enemy and grants caster 40 percent defense shield',()=>{
 const c=make('shield'),r=stepParityShieldDrain(c,{side:0,actorId:'a'});
 assert.equal(c.teams[0][0].shield,20);
 assert.ok(c.teams[1][0].hp<100);
 assert.equal(r.events.length,2);
 assert.equal(c.version,1);
});
test('drain heals from actual HP damage, capped at missing HP',()=>{
 const c=make('drain'),r=stepParityShieldDrain(c,{side:0,actorId:'a'});
 const damage=100-c.teams[1][0].hp;
 assert.equal(c.teams[0][0].hp,60+Math.min(40,Math.floor(damage*.15)));
 assert.equal(r.events.at(-1).damageType,'special');
});
test('tank special shields living frontline allies and itself',()=>{
 const c=make('shield');c.teams[0][0].role='tank';
 c.teams[0].push({id:'ally',hp:100,maxHp:100,attack:10,defense:10,shield:0,role:'fighter',lane:'front',position:1});
 c.teams[0].push({id:'back',hp:100,maxHp:100,attack:10,defense:10,shield:0,role:'fighter',lane:'back',position:2});
 const r=stepParityShieldDrain(c,{side:0,actorId:'a'});
 assert.equal(c.teams[0][0].shield,38);
 assert.equal(c.teams[0][1].shield,8);
 assert.equal(c.teams[0][2].shield,0);
 assert.equal(r.events.filter(e=>e.action==='tank-front-shield').length,2);
 assert.equal(r.events.filter(e=>e.action==='tank-self-shield').length,1);
});
test('energy active preserves its effect and adds authoritative role splash',()=>{
 const c=make('shield');c.teams[0][0].role='energy';c.teams[0][0].position=1;
 c.teams[1].push({...c.teams[1][0],id:'secondary',position:1,shield:2});
 const r=stepParityShieldDrain(c,{side:0,actorId:'a'});
 assert.equal(c.teams[0][0].shield,20);
 const primary=r.events.find(e=>e.action==='Ability');
 const splash=r.events.find(e=>e.action==='splash');
 assert.equal(splash.rawDamage,Math.max(1,Math.floor(primary.rawDamage*.15)));
 assert.equal(splash.absorbed,2);
 assert.equal(c.teams[1][1].hp,100-splash.value);
 assert.equal(c.version,1);
});
test('energy drain splash deaths grant energy once per death and never heal from shield damage',()=>{
 const c=make('drain');c.teams[0][0].role='energy';c.teams[0][0].position=1;
 c.teams[1][0].shield=10000;
 c.teams[1].push({...c.teams[1][0],id:'secondary',position:1,shield:0,hp:1});
 const r=stepParityShieldDrain(c,{side:0,actorId:'a'});
 assert.equal(c.teams[0][0].hp,62); // Drain heals 15% of HP damage, not shield absorption.
 assert.equal(c.teams[1][1].hp,0);
 assert.equal(c.teams[0][0].kills,1);
 assert.equal(c.abilities.energy[1],10);
 assert.equal(r.events.find(e=>e.action==='heal').value,2);
 assert.equal(r.events.find(e=>e.action==='splash').value,1);
});
test('energy primary plus splash kills each grant energy once while a shielded survivor remains',()=>{
 const c=make('drain');c.teams[0][0].role='energy';c.teams[1][0].hp=1;
 c.teams[1].push({...c.teams[1][0],id:'splash-kill',position:1});
 c.teams[1].push({...c.teams[1][0],id:'shielded',position:2,hp:100,shield:10000});
 const r=stepParityShieldDrain(c,{side:0,actorId:'a'});
 assert.equal(c.teams[0][0].kills,2);assert.equal(c.abilities.energy[1],20);
 assert.deepEqual(c.teams[1].map(u=>u.hp),[0,0,97]);assert.equal(c.finished,false);
 const shielded=r.events.find(e=>e.target==='shielded');assert.equal(shielded.value,3);assert.equal(shielded.absorbed,Math.floor(shielded.rawDamage*7/10));
});
