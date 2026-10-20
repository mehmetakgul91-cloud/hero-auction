import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
function setup(){
 const matchKey='test-match';
 const hero=(id,speed)=>({id,hp:100,maxHp:100,attack:10,defense:10,shield:0,lane:'front',position:0,speed});
 const combat=createLiveCommanderCombat({round:1,abilities:createLiveCommanderAbilities({matchKey,energy:[100,100],now:1000}),teams:[[hero('a',20)],[hero('b',10)]],commanders:[{commanderId:'defense'},{commanderId:'support'}]});
 const registry=createLiveArenaRegistry();
 registry.register({matchKey,tokens:['secret-A','secret-B'],combat,options:{parity:true}});
 return {registry,matchKey};
}
test('unknown seat cannot inspect or cast',()=>{
 const {registry,matchKey}=setup();
 assert.throws(()=>registry.snapshot({matchKey,token:'invalid'}),/Unauthorized/);
 assert.throws(()=>registry.cast({matchKey,token:'invalid',ability:'normal',requestId:'cast_00001',now:1000}),/Unauthorized/);
});
test('server-only hero action interleaves with authorized commander cast',()=>{
 const {registry,matchKey}=setup();
 const first=registry.stepServerHero(matchKey);
 assert.equal(first.result.version,1);
 const cast=registry.cast({matchKey,token:'secret-A',ability:'normal',requestId:'cast_00001',now:1000});
 assert.equal(cast.version,2);
 const snapshot=registry.snapshot({matchKey,token:'secret-A',sinceVersion:1});
 assert.equal(snapshot.version,2);
 assert.equal(snapshot.side,0);
 assert.equal(snapshot.abilities[0].energy,60);
 assert.equal(snapshot.abilities[1].energy,null);
 assert.equal(snapshot.nextHero.actorId,'b');
});
test('duplicate match registration is rejected',()=>{
 const {registry,matchKey}=setup();
 assert.throws(()=>registry.register({matchKey,tokens:['x','y'],combat:{}}),/Invalid live arena registration/);
});
