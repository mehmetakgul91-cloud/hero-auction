import test from'node:test';import assert from'node:assert/strict';import{simulateBattle}from'../battle-engine.js';import{calculateHeroRawDamage}from'../battle-damage-formula.js';
test('legacy magic skips only the next actual attack, matching live consumption',()=>{
 // Synthetic high HP keeps every actor alive so single-attack duration is isolated, not a
 // claim about normal auction-credit availability or balance.
 const cards=s=>Array.from({length:5},(_,i)=>({id:s+i,power:i===4?100:60,role:'fighter',lane:i<2?'front':'back'}));
 const commanders=['magic','defense'].map(commanderId=>({commanderId,levels:{magic:0,attack:0,defense:0,support:0}}));
 const r=simulateBattle(cards('a'),cards('b'),{seed:'duration',maxRounds:5,remainingCredits:[10000,10000],commanders,commanderActions:[{round:2,side:0,ability:'normal'}]});
 const actor=r.teams[1].find(u=>u.id==='b4');const events=r.log.filter(e=>e.actor===actor.id&&e.rawDamage!=null);assert.equal(events.length,4);assert.deepEqual(events.map(e=>e.round),[1,3,4,5]);
 const skips=r.log.filter(e=>e.actor===actor.id&&e.action==='stun-skip');assert.equal(skips.length,1);assert.equal(skips[0].round,2);assert.equal(skips[0].value,0);
 for(const event of events){const target=r.teams[0].find(u=>u.id===event.target);const expected=calculateHeroRawDamage({unit:actor,target,special:event.round%3===0,critical:event.critical,guarded:target.lane!=='front',weakened:0});assert.equal(event.rawDamage,expected,'round '+event.round);}
 assert.equal(actor.commanderStunNextAttack,undefined);assert.equal(actor.commanderWeaken,undefined);assert.equal(actor.commanderWeakenUntilRound,undefined);assert.equal(actor.commanderWeakenNextAttack,undefined);
});
