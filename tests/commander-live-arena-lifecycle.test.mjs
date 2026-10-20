import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveArenaLifecycle} from '../commander-live-arena-lifecycle.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
function combat(matchKey){
 const hero=(id,speed)=>({id,hp:100,maxHp:100,attack:10,defense:10,shield:0,lane:'front',position:0,speed});
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey,energy:[100,100],now:0}),teams:[[hero('a',20)],[hero('b',10)]],commanders:[{commanderId:'defense'},{commanderId:'support'}]});
}
test('commander casts between server hero ticks; ending room cancels runner',()=>{
 let now=0,callback,cancelCount=0;
 const lifecycle=createLiveArenaLifecycle({intervalMs:1000,clock:()=>now,scheduler:fn=>{callback=fn;return 7},canceller:()=>{cancelCount++}});
 const matchKey='123:1:99';
 lifecycle.begin({matchKey,tokens:['seat-A','seat-B'],combat:combat(matchKey),options:{parity:true}});
 now=1000;callback();
 const before=lifecycle.snapshot({matchKey,token:'seat-A',now});
 assert.equal(before.version,1);
 const cast=lifecycle.cast({matchKey,token:'seat-A',ability:'normal',requestId:'cast_12345678',now});
 assert.equal(cast.version,2);
 now=2000;callback();
 const after=lifecycle.snapshot({matchKey,token:'seat-A',now});
 assert.equal(after.version,3);
 assert.equal(after.abilities[0].energy,60);
 assert.equal(lifecycle.endRoom('123'),1);
 assert.equal(cancelCount,1);
 assert.equal(lifecycle.status(matchKey),null);
 assert.throws(()=>lifecycle.snapshot({matchKey,token:'seat-A'}),/Unknown active/);
});
test('same match cannot start twice, but rematch can after cleanup',()=>{
 const lifecycle=createLiveArenaLifecycle({scheduler:()=>7,canceller:()=>{}});
 const matchKey='456:1:99';
 lifecycle.begin({matchKey,tokens:['a','b'],combat:combat(matchKey),options:{parity:true}});
 assert.throws(()=>lifecycle.begin({matchKey,tokens:['a','b'],combat:combat(matchKey),options:{parity:true}}),/already active/);
 assert.equal(lifecycle.endRoom('456'),1);
 const nextKey='456:2:99';
 assert.equal(lifecycle.begin({matchKey:nextKey,tokens:['a','b'],combat:combat(nextKey),options:{parity:true}}).running,true);
 lifecycle.endRoom('456');
});
