import test from'node:test';import assert from'node:assert/strict';
import{createLiveCommanderAbilities}from'../commander-live-abilities.js';import{createLiveCommanderCombat,castLiveCommanderCombat}from'../commander-live-combat.js';
const hero=(id,hp)=>({id,hp,maxHp:100,attack:50,defense:30,shield:0});
const make=()=>createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'selected-focus',energy:[100,100],ultimateEnergy:[100,100],now:0}),teams:[[hero('a',100),hero('a-dead',0)],[hero('weak',1),hero('chosen',100),hero('dead',0)]],commanders:[{commanderId:'attack'},{commanderId:'attack'}]});
const cast=(c,targetIds,extra={})=>castLiveCommanderCombat(c,{side:0,ability:'ultimate',targetIds,matchKey:'selected-focus',requestId:'focus_request',now:0,...extra});
test('Av Emri honors selected living enemy rather than automatic lowest HP',()=>{const c=make();const r=cast(c,['chosen']);assert.equal(c.teams[1][1].commanderFocusUntilDeath,true);assert.equal(r.events.at(-1).impacts[0].target,'chosen');assert.equal(c.teams[0][1].commanderFocusTargetId,undefined);assert.equal(c.teams[1][1].hp,100);assert.equal(c.abilities.ultimateEnergy[0],25);assert.equal(c.abilities.energy[0],100);});
test('missing, dead, own-side, multiple and forged targets reject without spending or state changes',()=>{for(const ids of[undefined,[],['a'],['a-dead'],['dead'],['missing'],['chosen','weak']]){const c=make(),before=structuredClone(c);assert.throws(()=>cast(c,ids));assert.deepEqual(c,before);}});
test('target death before confirmation rejects; duplicate accepted request is idempotent and target-bound',()=>{const c=make();c.teams[1][1].hp=0;const before=structuredClone(c);assert.throws(()=>cast(c,['chosen']));assert.deepEqual(c,before);const d=make();cast(d,['chosen']);assert.equal(cast(d,['chosen'],{now:1}).duplicate,true);assert.throws(()=>cast(d,['weak'],{now:1}),/conflict/);assert.equal(d.abilities.ultimateEnergy[0],25);assert.equal(d.abilities.cooldownUntil[0],0);});

test('real registry binds selected opponent to authenticated seat and reconnect preserves focus and once use',async()=>{
 const{createLiveArenaRegistry}=await import('../commander-live-arena-registry.js');
 for(const side of[0,1]){
  const c=make();c.teams=[[hero('a-low',1),hero('a-high',100)],[hero('b-low',1),hero('b-high',100)]];
  const r=createLiveArenaRegistry();r.register({matchKey:'selected-focus',tokens:['left','right'],combat:c});
  const token=side?'right':'left',own=side?'b-high':'a-high',target=side?'a-high':'b-high';
  const req={matchKey:'selected-focus',token,ability:'ultimate',requestId:'chosen_registry',targetIds:[own],side:1-side,now:0};const before=structuredClone(c);
  assert.throws(()=>r.cast(req));assert.deepEqual(c,before);const result=r.cast({...req,targetIds:[target]});assert.equal(result.events.at(-1).impacts[0].target,target);
  assert.equal(r.cast({...req,targetIds:[target]}).duplicate,true);const refreshed=r.snapshot({matchKey:'selected-focus',token,now:1200});assert.equal(refreshed.side,side);assert.equal(refreshed.ultimateUsed[side],true);assert.equal(refreshed.abilities[side].ultimateEnergy,25);assert.equal(refreshed.abilities[side].energy,100);assert.equal(refreshed.abilities[side].normalCooldownMs,0);assert.equal(refreshed.teams[1-side].find(u=>u.id===target).commanderFocusUntilDeath,true);
 }
});
test('bot keeps deterministic lowest health-ratio targeting and sends explicit enemy ID',async()=>{
 const{chooseBotCast}=await import('../bot-strategy.js');const c=make();c.teams[1]=[hero('enemy-a',50),{...hero('enemy-z',70),maxHp:200},{...hero('enemy-b',70),maxHp:200}];
 const snapshot={teams:c.teams,round:1,abilities:[{energy:100,ultimateEnergy:100,canUseNormal:true,canUseUltimate:true},{}]};
 const choice=chooseBotCast(snapshot,'attack','hard',{side:0,now:10000,lastCastAt:0,startedAt:0});assert.deepEqual(choice,{ability:'ultimate',targetIds:['enemy-b']});cast(c,choice.targetIds);assert.equal(c.teams[1].find(u=>u.id==='enemy-b').commanderFocusUntilDeath,true);
});
