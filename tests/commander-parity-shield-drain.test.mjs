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
test('unsupported role rejects without changing combat',()=>{
 const c=make('shield');c.teams[0][0].role='tank';
 const before=structuredClone(c.teams);
 assert.throws(()=>stepParityShieldDrain(c,{side:0,actorId:'a'}),/Role special mechanics/);
 assert.deepEqual(c.teams,before);
 assert.equal(c.version,0);
});
