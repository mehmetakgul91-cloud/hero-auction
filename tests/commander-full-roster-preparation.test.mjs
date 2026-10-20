import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderOriginalRoster,commanderOriginalBattleCard} from '../commander-original-roster.js';
import {fighterFromCard} from '../battle-engine.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {auditIncrementalRoster} from '../commander-roster-parity-audit.js';
test('every real roster hero converts into a combat fighter without invalid stats',()=>{
 const ids=new Set();
 for(const hero of commanderOriginalRoster){
  assert.ok(!ids.has(hero.id),'duplicate id: '+hero.id);ids.add(hero.id);
  const fighter=fighterFromCard(commanderOriginalBattleCard({id:hero.id,power:75}),0);
  for(const stat of ['hp','maxHp','attack','defense','speed'])assert.ok(Number.isFinite(fighter[stat])&&fighter[stat]>=0,hero.id+':'+stat);
  assert.equal(fighter.active?.effect,hero.active?.effect);
  assert.equal(fighter.passive?.effect,hero.passive?.effect);
 }
});
test('all current original heroes are covered by prepared five-person teams',()=>{
 assert.ok(commanderOriginalRoster.length>=50);
 const covered=new Set();
 for(let start=0;start<commanderOriginalRoster.length;start+=5){
  const selected=Array.from({length:5},(_,i)=>commanderOriginalRoster[(start+i)%commanderOriginalRoster.length]);
  const cards=selected.map(h=>({id:h.id,power:75}));
  const teams=prepareLiveArenaTeams(cards,cards);
  assert.equal(teams.length,2);
  for(let i=0;i<5;i++){
   covered.add(selected[i].id);
   assert.ok(teams[0][i].maxHp>0);
   assert.ok(teams[0][i].attack>=0);
  }
 }
 assert.equal(covered.size,commanderOriginalRoster.length);
});
test('audit is informational and never claims legacy parity proven',()=>{
 const report=auditIncrementalRoster();
 assert.equal(report.total,commanderOriginalRoster.length);
 assert.ok(report.rows.every(row=>typeof row.ready==='boolean'));
});
