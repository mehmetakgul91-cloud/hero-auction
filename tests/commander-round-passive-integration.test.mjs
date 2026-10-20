import test from 'node:test';
import assert from 'node:assert/strict';
import {createBasicTurnSession} from '../commander-basic-turn-session.js';
function makeCombat(){
 const hero=(id,passive)=>({id,hp:40,maxHp:100,attack:50,defense:30,speed:20,role:'fighter',lane:'front',position:0,shield:0,passive,active:null});
 return {round:1,version:0,events:[],finished:false,teams:[[hero('r',{effect:'regen',value:.05})],[hero('g',{effect:'rage',value:.1})]]};
}
test('opt-in session applies round passives before first action',()=>{
 const combat=makeCombat();
 const session=createBasicTurnSession(combat,{parity:true,roundPassives:true});
 assert.equal(session.round,1);
 assert.equal(combat.teams[0][0].hp,45);
 assert.equal(combat.teams[1][0].attack,55);
 assert.equal(combat.events.filter(e=>e.action==='rage').length,1);
});
test('round passive heroes remain blocked without explicit option',()=>{
 assert.throws(()=>createBasicTurnSession(makeCombat(),{parity:true}),/Special hero mechanics/);
 assert.throws(()=>createBasicTurnSession(makeCombat(),{roundPassives:true}),/parity mode/);
});
