import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {commanderOriginalRoster} from '../commander-original-roster.js';
import {battleRoster} from '../battle-roster.js';
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
test('live arena accepts auction cards from classic and expanded original rosters',()=>{
 const classic=battleRoster.slice(0,5).map((h,i)=>({id:h.id,power:60+i,lane:i<2?'front':'back'}));
 const expanded=commanderOriginalRoster.slice(-5).map((h,i)=>({id:h.id,power:65+i,lane:i<2?'front':'back'}));
 const teams=prepareLiveArenaTeams(classic,expanded,{cardAdapter:'auction'});
 assert.equal(teams[0].length,5);assert.equal(teams[1].length,5);
 assert.deepEqual(teams[0][0].active,battleRoster.find(h=>h.id===classic[0].id).active);
 assert.equal(teams[1][0].id,expanded[0].id);
});
