import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBattleCard,prepareBattleTeams,finishAuctionWithBattle,auctionRoomToBattleState} from './battle-match.js';
import {battleRoster} from './battle-roster.js';
const cards=battleRoster.slice(0,10).map(c=>({name:c.name,power:70}));
const state={finished:true,teamA:cards.slice(0,5),teamB:cards.slice(5),remainingCreditsA:0,remainingCreditsB:0};
test('maps auction card names to initial 50 roster',()=>assert.equal(normalizeBattleCard({name:battleRoster[0].name,power:87}).id,battleRoster[0].id));
test('requires finalized auction',()=>assert.throws(()=>prepareBattleTeams({...state,finished:false})));
test('rejects duplicate hero assignments',()=>assert.throws(()=>prepareBattleTeams({...state,teamB:[cards[0],...cards.slice(6)]})));
test('rejects out-of-range power',()=>assert.throws(()=>normalizeBattleCard({name:battleRoster[0].name,power:1000})));
test('battle result is stable for same match',()=>assert.deepEqual(finishAuctionWithBattle(state,{matchId:'demo-42'}),finishAuctionWithBattle(state,{matchId:'demo-42'})));

test('battle requires authoritative final credit balances',()=>assert.throws(()=>finishAuctionWithBattle({...state,remainingCreditsA:undefined},{matchId:'missing-credits'})));

test('finished classic auction room transfers cards and saved credits to isolated battle adapter',()=>{const room={phase:'finished',players:[{team:cards.slice(0,5),credits:4},{team:cards.slice(5),credits:12}]};const converted=auctionRoomToBattleState(room);assert.equal(converted.remainingCreditsA,4);assert.equal(converted.remainingCreditsB,12);assert.equal(converted.teamA.length,5);assert.equal(converted.teamB.length,5);const result=finishAuctionWithBattle(converted,{matchId:'adapter-test'});assert.equal(result.remainingCredits[0],4);assert.equal(result.remainingCredits[1],12);});
test('unfinished auction rooms cannot enter battle adapter',()=>assert.throws(()=>auctionRoomToBattleState({phase:'auction',players:[]})));
