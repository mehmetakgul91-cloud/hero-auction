import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderOriginalRoster} from '../commander-original-roster.js';
import {auditIncrementalRoster} from '../commander-roster-parity-audit.js';
import {createBasicTurnSession} from '../commander-basic-turn-session.js';
test('full roster audit preserves every current hero and its mechanics',()=>{
 const report=auditIncrementalRoster();
 assert.equal(report.total,commanderOriginalRoster.length);
 assert.equal(report.ready+report.blocked,report.total);
 assert.ok(report.total>0);
 for(const row of report.rows)assert.equal(row.ready,row.issues.length===0);
 assert.deepEqual(report.rows.map(({id,role,active,passive})=>({id,role,active,passive})),
  commanderOriginalRoster.map(hero=>({id:hero.id,role:hero.role,active:hero.active?.effect||null,passive:hero.passive?.effect||null})));
 assert.equal(report.blocked,report.rows.filter(row=>!row.ready).length);
});
test('unimplemented active mechanics fail closed even with every feature flag',()=>{
 const hero=(id,active)=>({id,hp:100,maxHp:100,attack:50,defense:40,speed:20,role:'fighter',lane:'front',position:0,active,passive:null});
 const flags={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true};
 for(const effect of ['burst','pierce','headshot','splash']){
  const combat={round:1,version:0,events:[],finished:false,teams:[[hero('a',{effect})],[hero('b',null)]]};
  assert.throws(()=>createBasicTurnSession(combat,flags),/Special hero mechanics/,effect);
 }
});

test('audit classifies explicit damage mechanics independently of the live roster',()=>{
 const effects=['headshot','pierce','burst','splash'];
 const report=auditIncrementalRoster(effects.map(effect=>({id:'fixture-'+effect,role:'fighter',active:{effect}})));
 assert.deepEqual(report.rows.map(row=>row.active),effects);
 assert.equal(report.ready,effects.length);
 assert.equal(report.blocked,0);
});
test('audit reports unknown mechanics without marking the hero ready',()=>{
 const report=auditIncrementalRoster([{id:'unsupported-fixture',role:'fighter',active:{effect:'unknown-active'},passive:{effect:'unknown-passive'}}]);
 assert.equal(report.ready,0);
 assert.equal(report.blocked,1);
 assert.deepEqual(report.rows[0].issues,['unsupported-passive:unknown-passive','unsupported-active:unknown-active']);
 assert.deepEqual(report.issueCounts,{'unsupported-passive:unknown-passive':1,'unsupported-active:unknown-active':1});
});
