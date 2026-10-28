import test from 'node:test';
import assert from 'node:assert/strict';
import {battleOutcome} from '../battle-result.js';
import {settleLiveBattle} from '../live-battle-settlement.js';
import {createLiveArenaLifecycle} from '../commander-live-arena-lifecycle.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';

const hero=(id,hp=100,damage=0)=>({id,name:id,hp,maxHp:100,damage,attack:100,defense:0,shield:0,speed:50,position:0,lane:'front',role:'fighter'});
const room=()=>({code:'123',matchNumber:1,created:99,phase:'finished',series:[0,0],battleSettlementPending:true,battleSync:{key:'1:99',result:{live:true,winner:0}}});
const record=(r,winner)=>{r.matchSettled=true;if(winner!==null)r.series[winner]++};

test('round limit resolves remaining health, then damage, rather than treating equal survivors as a draw',()=>{
 assert.equal(battleOutcome([[hero('a',90)],[hero('b',50)]]).winner,0);
 assert.equal(battleOutcome([[hero('a',50,10)],[hero('b',50,20)]]).winner,1);
 assert.equal(battleOutcome([[hero('a',50,20)],[hero('b',50,20)]]).winner,null);
 assert.equal(battleOutcome([[hero('a',0,999)],[hero('b',1)]]).winner,1);
});

test('only the completed live outcome counts, once, and replaces a different precomputed winner',()=>{
 const r=room(),key='123:1:99',snapshot={finished:false,round:4,teams:[[hero('a',0)],[hero('b',45)]],events:[]};
 assert.equal(settleLiveBattle(r,key,snapshot,record),false);
 assert.deepEqual(r.series,[0,0]);
 snapshot.finished=true;
 assert.equal(settleLiveBattle(r,key,snapshot,record),true);
 assert.deepEqual(r.series,[0,1]);assert.equal(r.battleSync.result.winner,1);
 assert.equal(r.battleSettlementPending,false);
 for(let i=0;i<5;i++)assert.equal(settleLiveBattle(r,key,snapshot,record),false);
 assert.deepEqual(r.series,[0,1]);
 snapshot.teams[1][0].hp=0;
 assert.equal(r.battleSync.result.teams[1][0].hp,45,'stored result is immutable from caller');
});

test('consecutive rematches retain the series, ignore stale finishes and count draws without adding a win',()=>{
 const r=room();
 const finish=(teams)=>({finished:true,round:15,teams,events:[]});
 settleLiveBattle(r,'123:1:99',finish([[hero('a',0)],[hero('b',45)]]),record);
 r.matchNumber=2;r.created=100;r.matchSettled=false;r.battleSync={key:'2:100',result:{live:true}};
 assert.equal(settleLiveBattle(r,'123:1:99',finish([[hero('a',0)],[hero('b',45)]]),record),false);
 settleLiveBattle(r,'123:2:100',finish([[hero('a',80)],[hero('b',0)]]),record);
 assert.deepEqual(r.series,[1,1]);
 r.matchNumber=3;r.created=101;r.matchSettled=false;r.battleSync={key:'3:101',result:{live:true}};
 settleLiveBattle(r,'123:3:101',finish([[hero('a',80)],[hero('b',80)]]),record);
 assert.deepEqual(r.series,[1,1]);assert.equal(r.battleSync.result.winner,null);assert.equal(r.matchSettled,true);
});

test('a finishing commander cast settles immediately once, even without either player polling',()=>{
 const r=room(),matchKey='123:1:99';let now=0,tick,settlements=0;
 const teams=[[hero('a',5)],[hero('b',90)]];
 const combat=createLiveCommanderCombat({teams,abilities:createLiveCommanderAbilities({matchKey,energy:[100,100],now:0}),commanders:[{commanderId:'defense'},{commanderId:'attack'}]});
 const arena=createLiveArenaLifecycle({clock:()=>now,scheduler:fn=>{tick=fn;return 1},canceller:()=>{},onFinish:(snapshot,key)=>{settlements++;settleLiveBattle(r,key,snapshot,record)}});
 arena.begin({matchKey,tokens:['a','b'],combat,options:{parity:true}});
 arena.cast({matchKey,token:'b',ability:'normal',requestId:'deciding_normal',now:1000});
 assert.deepEqual(r.series,[0,1]);assert.equal(arena.status(matchKey).scheduled,false);
 for(let i=0;i<3;i++){now+=1000;tick();assert.equal(arena.snapshot({matchKey,token:'a',sinceVersion:1}).winner,1)}
 assert.equal(settlements,1);
});

test('hero attacks also settle after the final action without browser polling',()=>{
 const r=room(),matchKey='123:1:99';let now=0,tick;
 const combat=createLiveCommanderCombat({teams:[[hero('a')],[hero('b',1)]],abilities:createLiveCommanderAbilities({matchKey,now:0}),commanders:[{commanderId:'defense'},{commanderId:'support'}]});
 const arena=createLiveArenaLifecycle({intervalMs:1000,clock:()=>now,scheduler:fn=>{tick=fn;return 1},canceller:()=>{},onFinish:(snapshot,key)=>settleLiveBattle(r,key,snapshot,record)});
 arena.begin({matchKey,tokens:['a','b'],combat,options:{parity:true}});
 for(let i=0;i<3;i++){now+=1000;tick()}
 assert.deepEqual(r.series,[1,0]);assert.equal(r.battleSync.result.finished,true);
});
