import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaLifecycle} from '../commander-live-arena-lifecycle.js';

test('live arena publishes completion after the last action of round 15',()=>{
 let now=0,tick;
 const teams=[0,1].map(side=>Array.from({length:5},(_,position)=>({
  id:side+':'+position,name:'Hero',hp:150000,maxHp:150000,attack:75,defense:75,
  speed:75,position,lane:position<2?'front':'back',shield:0,role:'fighter'
 })));
 const combat=createLiveCommanderCombat({teams,
  abilities:createLiveCommanderAbilities({matchKey:'limit',now}),
  commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
 const errors=[];
 const arena=createLiveArenaLifecycle({clock:()=>now,scheduler:fn=>{tick=fn;return 1},
  canceller:()=>{},onError:error=>errors.push(error)});
 arena.begin({matchKey:'limit',tokens:['seat-a','seat-b'],combat,options:{parity:true}});
 for(let i=0;i<200&&arena.status('limit').scheduled;i++){now+=900;tick();}
 const snapshot=arena.snapshot({matchKey:'limit',token:'seat-a'});
 assert.equal(snapshot.round,15);
 assert.equal(snapshot.finished,true);
 assert.equal(snapshot.nextHero,null);
 assert.equal(snapshot.abilities[0].finished,true);
 assert.equal(arena.status('limit').scheduled,false);
 assert.deepEqual(errors,[]);
});
