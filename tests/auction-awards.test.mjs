import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOfferedAwards,displaySeat} from '../public/auction-awards.js';
const hero=n=>({name:'Hero '+n,universe:'original'});
for(const seat of [0,1])test(`offered card glides only to actual buyer ${seat}, including final round`,()=>{
 const previous={code:'a',phase:'auction',round:6,card:hero(1),players:[{team:[]},{team:[]}]};
 const players=[{team:[]},{team:[]}];players[seat].team=[hero(1)];
 const next={code:'a',phase:'auction',players};
 assert.deepEqual(collectOfferedAwards(previous,next),[{card:hero(1),seat,round:6,code:'a'}]);
 assert.deepEqual(collectOfferedAwards(next,next),[]);
 players[1-seat].team=[hero(2),hero(3)];
 assert.equal(collectOfferedAwards(previous,{...next,phase:'finished',final:players}).length,1);
 assert.equal(displaySeat(seat,seat),0);assert.equal(displaySeat(seat,1-seat),1);
});
test('no offered-card replay on cold restore, rematch, foreign room or unawarded snapshots',()=>{
 const previous={code:'a',phase:'auction',card:hero(1),players:[{team:[]},{team:[]}]};
 assert.deepEqual(collectOfferedAwards(null,previous),[]);
 assert.deepEqual(collectOfferedAwards(previous,previous),[]);
 assert.deepEqual(collectOfferedAwards(previous,{code:'b',players:[{team:[hero(1)]}]}),[]);
 assert.deepEqual(collectOfferedAwards({...previous,phase:'finished'},previous),[]);
});
