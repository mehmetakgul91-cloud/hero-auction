import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {commanderOriginalRoster} from '../commander-original-roster.js';
const cards=()=>commanderOriginalRoster.slice(0,5).map((h,i)=>({id:h.id,power:50+i*5,lane:i<2?'front':'back'}));
test('preparation preserves roster skills and applies credits to real cards',()=>{
 const a=cards(),b=cards();
 const normal=prepareLiveArenaTeams(a,b);
 const boosted=prepareLiveArenaTeams(a,b,{remainingCredits:[10,0]});
 assert.equal(normal[0].length,5);
 assert.deepEqual(normal[0][0].passive,commanderOriginalRoster[0].passive);
 assert.equal(normal[0][0].lane,'front');
 assert.equal(normal[0][3].lane,'back');
 assert.ok(boosted[0][0].attack>normal[0][0].attack);
 assert.equal(boosted[1][0].attack,normal[1][0].attack);
});
test('preparation rejects incomplete teams and invalid credit balance',()=>{
 assert.throws(()=>prepareLiveArenaTeams(cards().slice(1),cards()),/five cards/);
 assert.throws(()=>prepareLiveArenaTeams(cards(),cards(),{remainingCredits:[1.5,0]}),/credits/);
});
