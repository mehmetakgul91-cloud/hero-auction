import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaSession,castDuringLiveArena,stepLiveArenaHero,viewLiveArenaSession} from '../commander-live-arena-session.js';
function setup(){
 const hero=(id,speed)=>({id,hp:100,maxHp:100,attack:10,defense:10,shield:0,lane:'front',position:0,speed});
 const combat=createLiveCommanderCombat({round:1,abilities:createLiveCommanderAbilities({matchKey:'live:arena',energy:[100,100],now:1000}),teams:[[hero('a',20)],[hero('b',10)]],commanders:[{commanderId:'defense'},{commanderId:'support'}]});
 return createLiveArenaSession(combat,{parity:true});
}
test('commander cast between hero actions updates the same snapshot',()=>{
 const session=setup();
 const first=stepLiveArenaHero(session);
 assert.equal(first.result.version,1);
 const before=viewLiveArenaSession(session);
 const cast=castDuringLiveArena(session,{side:0,ability:'normal',requestId:'live_cast_0001',matchKey:'live:arena',now:1000});
 assert.equal(cast.version,2);
 assert.equal(session.combat.abilities.energy[0],60);
 assert.equal(viewLiveArenaSession(session).nextHero.actorId,'b');
 assert.equal(viewLiveArenaSession(session,{sinceVersion:1}).events.every(e=>e.version===2),true);
 assert.equal(before.nextHero.actorId,'b');
 const second=stepLiveArenaHero(session);
 assert.equal(second.result.version,3);
});
test('cooldown rejects immediate second cast without consuming energy',()=>{
 const session=setup();
 castDuringLiveArena(session,{side:0,ability:'normal',requestId:'live_cast_0001',matchKey:'live:arena',now:1000});
 assert.throws(()=>castDuringLiveArena(session,{side:0,ability:'normal',requestId:'live_cast_0002',matchKey:'live:arena',now:1001}),/cooldown/);
 assert.equal(session.combat.abilities.energy[0],60);
});
