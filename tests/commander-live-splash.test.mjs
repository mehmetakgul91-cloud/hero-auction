import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {applyServerSplashAction} from '../commander-live-splash.js';
function make(){
 const hero=(id,hp=100,shield=0)=>({id,hp,maxHp:100,attack:100,defense:0,shield,role:'energy',lane:'back',position:0});
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'splash:1',energy:[0,0],now:1000}),teams:[[hero('a')],[hero('b'),hero('c',20,10),hero('d',5)]],commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
}
test('splash damages secondary enemies and consumes shield before HP atomically',()=>{
 const c=make();
 const result=applyServerSplashAction(c,{side:0,actorId:'a',primaryTargetId:'b',primaryRaw:100,skill:{effect:'splash'}});
 assert.equal(c.teams[1][0].hp,100);
 assert.equal(c.teams[1][1].hp,5);
 assert.equal(c.teams[1][1].shield,0);
 assert.equal(c.teams[1][2].hp,0);
 assert.equal(c.teams[0][0].damage,20);
 assert.equal(c.teams[0][0].kills,1);
 assert.equal(c.abilities.energy[1],10);
 assert.equal(result.events.length,2);
 assert.equal(c.version,1);
});
test('invalid splash is rejected without mutating authoritative state',()=>{
 const c=make(),snapshot=structuredClone(c.teams);
 assert.throws(()=>applyServerSplashAction(c,{side:0,actorId:'a',primaryTargetId:'missing',primaryRaw:100,skill:{effect:'splash'}}),/Invalid splash actor/);
 assert.deepEqual(c.teams,snapshot);
 assert.equal(c.version,0);
});
