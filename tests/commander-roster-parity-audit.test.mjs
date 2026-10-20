import test from 'node:test';
import assert from 'node:assert/strict';
import {battleRoster} from '../battle-roster.js';
import {auditIncrementalRoster} from '../commander-roster-parity-audit.js';
import {createBasicTurnSession} from '../commander-basic-turn-session.js';
test('full roster audit accounts for every character and reports unsupported abilities',()=>{
 const report=auditIncrementalRoster();
 assert.equal(report.total,battleRoster.length);
 assert.equal(report.ready+report.blocked,report.total);
 assert.ok(report.total>0);
 for(const row of report.rows)assert.equal(row.ready,row.issues.length===0);
 assert.ok(report.rows.some(row=>row.active==='headshot'));
 assert.ok(report.rows.some(row=>row.active==='pierce'));
 assert.ok(report.rows.some(row=>row.active==='burst'));
 assert.ok(report.rows.some(row=>row.active==='splash'));
});
test('unimplemented active mechanics fail closed even with every feature flag',()=>{
 const hero=(id,active)=>({id,hp:100,maxHp:100,attack:50,defense:40,speed:20,role:'fighter',lane:'front',position:0,active,passive:null});
 const flags={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true};
 for(const effect of ['burst','pierce','headshot','splash']){
  const combat={round:1,version:0,events:[],finished:false,teams:[[hero('a',{effect})],[hero('b',null)]]};
  assert.throws(()=>createBasicTurnSession(combat,flags),/Special hero mechanics/,effect);
 }
});
