import test from 'node:test';
import assert from 'node:assert/strict';
import {awardUnbidCard} from './auction-passes.js';
const room=()=>({players:[{team:[],credits:20},{team:[],credits:20}],cards:Array.from({length:10},(_,i)=>({id:'hero'+i})),round:0,topBid:0,topSeat:null,openingPassSeat:0});
test('all unbid cards complete two teams for bot, human, timeout and rematch flows',()=>{
 for(const flow of ['bot','human','timeout','rematch']){
  const r=room();r.mode=flow;
  for(let i=0;i<10;i++){r.openingPassSeat=i%2;awardUnbidCard(r,()=>5)}
  assert.deepEqual(r.players.map(p=>p.team.length),[5,5]);assert.equal(new Set(r.players.flatMap(p=>p.team.map(c=>c.id))).size,10);assert.deepEqual(r.players.map(p=>p.credits),[-5,-5]);
 }
});
test('first passing seat receives card and full team falls back to opponent',()=>{
 const r=room();r.openingPassSeat=1;assert.equal(awardUnbidCard(r,()=>3).seat,1);
 r.players[0].team=Array.from({length:5},()=>({}));r.openingPassSeat=0;assert.equal(awardUnbidCard(r,()=>3).seat,1);assert.equal(r.players[0].team.length,5);
});
