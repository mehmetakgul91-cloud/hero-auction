import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBattleCard,prepareBattleTeams,finishAuctionWithBattle} from './battle-match.js';
import {battleRoster} from './battle-roster.js';
const cards=battleRoster.slice(0,10).map(c=>({name:c.name,power:70}));
const state={finished:true,teamA:cards.slice(0,5),teamB:cards.slice(5),remainingCreditsA:0,remainingCreditsB:0};
test('maps auction card names to initial 50 roster',()=>assert.equal(normalizeBattleCard({name:'Hulk',power:87}).id,'marvel:hulk'));
test('requires finalized auction',()=>assert.throws(()=>prepareBattleTeams({...state,finished:false})));
test('rejects duplicate hero assignments',()=>assert.throws(()=>prepareBattleTeams({...state,teamB:[cards[0],...cards.slice(6)]})));
test('rejects out-of-range power',()=>assert.throws(()=>normalizeBattleCard({name:'Hulk',power:1000})));
test('battle result is stable for same match',()=>assert.deepEqual(finishAuctionWithBattle(state,{matchId:'demo-42'}),finishAuctionWithBattle(state,{matchId:'demo-42'})));

test('battle requires authoritative final credit balances',()=>assert.throws(()=>finishAuctionWithBattle({...state,remainingCreditsA:undefined},{matchId:'missing-credits'})));
