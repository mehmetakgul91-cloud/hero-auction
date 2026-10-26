import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {battleRoster} from '../battle-roster.js';
import {preferredLane,buildDefaultFormation,validateFormation} from '../public/preparation-formation.js';

const team=battleRoster.slice(0,5);
test('defaults use every real hero lane preference, including role exceptions',()=>{
 for(const hero of battleRoster){
  assert.equal(preferredLane(hero),hero.laneModifiers.front>hero.laneModifiers.back?'front':'back',hero.name);
 }
 for(const [name,lane] of [['Kadim Koruyucu','back'],['Eloren','back'],['Kök Dervişi','front'],['Sancak Bekçisi','front'],['Kum Hançeri','back']])assert.equal(preferredLane(battleRoster.find(hero=>hero.name===name)),lane);
 assert.equal(preferredLane({role:'tank'}),'front');assert.equal(preferredLane({role:'energy'}),'back');
});

test('all acquired heroes keep deterministic order and legal lane counts',()=>{
 const frozen=team.map(hero=>Object.freeze({...hero}));
 const first=buildDefaultFormation(frozen),second=buildDefaultFormation(frozen);
 assert.deepEqual(first,second);assert.deepEqual(first.positions,[0,1,2,3,4]);
 assert.ok(validateFormation(first,team));
 for(const lane of ['front','back'])assert.ok(validateFormation({...first,lanes:Array(5).fill(lane)},team),'existing rules permit five in either row');
 first.lanes[0]='back';assert.notDeepEqual(first,second);
 assert.ok(validateFormation({positions:[4,3,2,1,0],lanes:second.lanes,roles:[...team].reverse().map(h=>h.role)},team),'valid historical order remains supported');
});

test('formation validation rejects duplicates, missing or invalid slots, lanes, roles, and rosters',()=>{
 const valid=buildDefaultFormation(team);
 for(const positions of [[0,1,2,3,3],[0,1,2,3,5],[0,1,2,3,-1],[0,1,2,3,1.5],[0,1,2,3,null],[0,1,2,3],null])assert.equal(validateFormation({...valid,positions},team),false);
 for(const lanes of [['front','front','front','front','middle'],['front'],null])assert.equal(validateFormation({...valid,lanes},team),false);
 assert.equal(validateFormation({...valid,roles:['fighter',...valid.roles.slice(1)]},team),false);
 assert.equal(validateFormation({...valid,roles:valid.roles.slice(1)},team),false);
 assert.equal(validateFormation(valid,[team[0],team[0],...team.slice(2)]),false);
 assert.throws(()=>buildDefaultFormation(team.slice(1)),/Five distinct/);
});

test('server room snapshots restore drafts and preserve confirmed historical formations without overwriting',()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function ensureBattlePreparation('),source.indexOf('function battleSessionResult('));
 const context={requireBattleNotCancelled(){},buildDefaultFormation,marks:0,markRoom(){context.marks++}};
 runInNewContext(`${code};this.ensure=ensureBattlePreparation;this.view=preparationView`,context);
 const teams=[team,battleRoster.slice(5,10)],room={created:123,matchNumber:1};
 let sync=context.ensure(room,teams);
 assert.deepEqual(Array.from(sync.ready),[null,null]);
 const expected={...buildDefaultFormation(team),lanes:Array(5).fill('back')};
 sync.drafts[0]=expected;
 const restored=JSON.parse(JSON.stringify(room));
 sync=context.ensure(restored,teams);
 assert.deepEqual(JSON.parse(JSON.stringify(context.view(sync,0))),{matchKey:'1:123',...expected,ready:false});
 const marks=context.marks;
 for(let i=0;i<4;i++)context.ensure(restored,teams);
 assert.equal(context.marks,marks,'repeat reads do not reassign or repersist drafts');
 sync.ready[0]={positions:[4,3,2,1,0],lanes:Array(5).fill('front'),roles:[...team].reverse().map(h=>h.role)};
 delete sync.drafts;
 const confirmed=JSON.stringify(sync.ready[0]);
 context.ensure(restored,teams);
 assert.equal(JSON.stringify(sync.ready[0]),confirmed,'legacy confirmed order must not be normalized');
 assert.equal(context.view(sync,0).ready,true);
 restored.matchNumber=2;restored.created=124;
 sync=context.ensure(restored,teams);
 assert.equal(context.view(sync,0).ready,false);
 assert.deepEqual(Array.from(sync.drafts[0].lanes),buildDefaultFormation(team).lanes,'new match alone gets fresh automatic lanes');
});
