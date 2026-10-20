import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLegacyStartPassives,applyLegacyRoundPassives} from '../commander-parity-passives.js';
test('legacy starting passives change only corresponding stats',()=>{
 const unit=(effect,value)=>({id:effect,hp:100,maxHp:100,attack:50,defense:40,speed:30,passive:{effect,value}});
 const teams=[[unit('guard',.1),unit('focus',.2)],[unit('evasion',.1),unit('resist',.25),unit('momentum',.2)]];
 const next=applyLegacyStartPassives(teams);
 assert.equal(next[0][0].defense,44);
 assert.equal(next[0][1].attack,60);
 assert.equal(next[1][0].speed,33);
 assert.equal(next[1][1].defense,50);
 assert.equal(next[1][2].speed,36);
 assert.equal(teams[0][0].defense,40);
});
test('regen and rage follow legacy rounding and only activate rage once',()=>{
 const combat={round:2,version:0,events:[],finished:false,teams:[[{id:'r',hp:70,maxHp:100,attack:20,passive:{effect:'regen',value:.05}}],[{id:'g',hp:40,maxHp:100,attack:50,passive:{effect:'rage',value:.1}}]]};
 const first=applyLegacyRoundPassives(combat);
 assert.equal(combat.teams[0][0].hp,75);
 assert.equal(combat.teams[1][0].attack,55);
 assert.equal(first.events.length,2);
 applyLegacyRoundPassives(combat);
 assert.equal(combat.teams[0][0].hp,80);
 assert.equal(combat.teams[1][0].attack,55);
 assert.equal(combat.events.filter(e=>e.action==='rage').length,1);
});
