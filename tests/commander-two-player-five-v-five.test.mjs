import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderOriginalRoster} from '../commander-original-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaLifecycle} from '../commander-live-arena-lifecycle.js';
test('two player seats: 5v5 live arena with independent casts',()=>{
 const selected=commanderOriginalRoster.slice(0,10);
 assert.equal(selected.length,10);
 const cards=xs=>xs.map(h=>({id:h.id,power:75}));
 const teams=prepareLiveArenaTeams(cards(selected.slice(0,5)),cards(selected.slice(5)));
 const matchKey='712:1:smoke';
 const combat=createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey,energy:[100,100],now:0}),teams,commanders:[{commanderId:'defense'},{commanderId:'attack'}]});
 let now=0,tick;
 const lifecycle=createLiveArenaLifecycle({intervalMs:100,clock:()=>now,scheduler:fn=>{tick=fn;return 1},canceller:()=>{}});
 lifecycle.begin({matchKey,tokens:['seat-A','seat-B'],combat,options:{parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true}});
 assert.throws(()=>lifecycle.snapshot({matchKey,token:'outsider'}),/Unauthorized/);
 assert.equal(lifecycle.snapshot({matchKey,token:'seat-A',now}).side,0);
 assert.equal(lifecycle.snapshot({matchKey,token:'seat-B',now}).side,1);
 assert.ok(lifecycle.cast({matchKey,token:'seat-A',ability:'normal',requestId:'cast_A_1234',now}).events.length);
 assert.ok(lifecycle.cast({matchKey,token:'seat-B',ability:'normal',requestId:'cast_B_1234',now}).events.length);
 for(let i=0;i<170&&!combat.finished;i++){now+=100;tick();const state=lifecycle.status(matchKey);assert.equal(state.lastError,null);}
 assert.ok(combat.version>12);
 assert.ok(combat.events.some(e=>e.action==='round-start'));
 assert.ok(combat.events.some(e=>String(e.actor).startsWith('original:')));
 assert.equal(lifecycle.endRoom('712'),1);
 assert.throws(()=>lifecycle.snapshot({matchKey,token:'seat-A'}),/Unknown active/);
});
