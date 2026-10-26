import {victoryChestView} from '../victory-chests.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {roomArenaPresentation} from '../arena-theme.js';
const room={code:'room',matchNumber:1,created:123};
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const serialize=source.match(/ sync\.result=\{winner:result\.winner[^\n]+;/)[0];
const response=source.match(/ return send\(200,\{arenaPresentation:roomArenaPresentation\(room\),ready:sync\.ready\.map\(Boolean\),started:Boolean\(sync\.result\)[^\n]+/)[0].trim();
function fixture(live=false){
 const result={winner:0,rounds:3,teams:[[{id:'a',shield:7}],[{id:'b',shield:19}]],initialShields:[[1],[2]],log:[{side:0,actor:'a',shieldSnapshot:[[7],[19]],actionId:'3:0:a'}]};
 const sync={ready:[true,true]};
 runInNewContext(serialize,{sync,result,room,matchKey:'match',liveArenaMatchKeys:new Map(live?[['room','room:match']]:[]),commanderProfiles:[null,null]});
 return sync;
}
for(const seat of [0,1])test(`auction bot shield payload is preserved and oriented for seat ${seat}`,()=>{
 const sync=fixture(),before=structuredClone(sync.result);let body;
 runInNewContext('(function(){'+response+'})()',{sync,seat,room,roomArenaPresentation,victoryChestView,orientBattleSummary:()=>undefined,send:(status,value)=>{assert.equal(status,200);body=JSON.parse(JSON.stringify(value));}});
 assert.deepEqual(body.arenaPresentation,roomArenaPresentation(room));
 assert.deepEqual(body.result.arenaPresentation,body.arenaPresentation,'cosmetics retain shared orientation');
 assert.deepEqual(body.result.teams,seat===0?before.teams:[...before.teams].reverse());
 assert.deepEqual(body.result.initialShields,seat===0?[[1],[2]]:[[2],[1]]);
 assert.deepEqual(body.result.log[0].shieldSnapshot,seat===0?[[7],[19]]:[[19],[7]]);
 assert.equal(body.result.log[0].side,seat);
 assert.deepEqual(JSON.parse(JSON.stringify(sync.result)),JSON.parse(JSON.stringify(before)),'serialization does not mutate shared match data');
});
test('live response keeps authoritative team shields while absent replay metadata remains optional',()=>{
 const sync=fixture(true);delete sync.result.initialShields;sync.result.log=[];let body;
 runInNewContext('(function(){'+response+'})()',{sync,seat:1,room,roomArenaPresentation,victoryChestView,orientBattleSummary:()=>undefined,send:(_,value)=>body=JSON.parse(JSON.stringify(value))});
 assert.equal(body.result.live,true);assert.equal(body.result.teams[0][0].shield,19);assert.ok(!('initialShields' in body.result));
});
test('public preview and two-player preview retain initial shields rather than stripping them',()=>{
 const wrappers=source.match(/return (?:send\(200,)?\{(?:demo:true,|arenaPresentation:roomArenaPresentation\(session\),)?winner:result\.winner,rounds:result\.rounds,teams:result\.teams[^\n;]+/g);
 assert.ok(wrappers.length>=2);
 for(const wrapper of wrappers)assert.match(wrapper,/initialShields:result\.initialShields/);
});
