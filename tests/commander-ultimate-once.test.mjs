import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities,viewLiveCommanderAbilities,castLiveCommanderAbility,grantLiveCommanderEnergy} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {chooseBotCast} from '../bot-strategy.js';
const make=kind=>createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'once-match',energy:[100,100],now:0}),teams:[[0,1,2].map(i=>({id:'a'+i,hp:i===2?0:80,maxHp:100,attack:40,defense:20,shield:0,power:80})),[{id:'b0',hp:1000,maxHp:1000,attack:30,defense:20,shield:0}]],commanders:[{commanderId:kind},{commanderId:'defense'}]});
const cast=(c,kind,extra={})=>castLiveCommanderCombat(c,{side:0,ability:'ultimate',requestId:'ultimate_001',matchKey:'once-match',now:1000,...(kind==='magic'?{targetIds:['a0']}:kind==='support'?{targetIds:['a2']}:{}),...extra});
for(const kind of ['attack','defense','magic','support'])test(`${kind}: one successful ultimate, duplicates safe, normal repeats, fresh rematch resets`,()=>{
 const c=make(kind);cast(c,kind);assert.deepEqual(c.ultimateUsed,[true,false]);assert.deepEqual(viewLiveCommanderCombat(c).ultimateUsed,[true,false]);
 const snapshot=viewLiveCommanderCombat(c);snapshot.ultimateUsed[0]=false;assert.equal(c.ultimateUsed[0],true);
 assert.equal(cast(c,kind,{now:2000}).duplicate,true);
 grantLiveCommanderEnergy(c.abilities,0,100);const before=viewLiveCommanderCombat(c);
 assert.throws(()=>cast(c,kind,{now:7000,requestId:'ultimate_002'}),/already used/);assert.deepEqual(viewLiveCommanderCombat(c),before);assert.equal(c.abilities.energy[0],100);
 assert.equal(viewLiveCommanderAbilities(c.abilities,0,7000).canUseUltimate,false);assert.equal(viewLiveCommanderAbilities(c.abilities,0,7000).canUseNormal,true);
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'normal_001',matchKey:'once-match',now:7000,...(kind==='magic'?{targetIds:['b0']}: {})});
 if(kind==='support')c.teams[0][0].hp=30;
 castLiveCommanderCombat(c,{side:0,ability:'normal',requestId:'normal_002',matchKey:'once-match',now:13000,...(kind==='magic'?{targetIds:['b0']}: {})});
 assert.equal(c.abilities.energy[0],20);assert.deepEqual(make(kind).ultimateUsed,[false,false]);
});
test('invalid target and insufficient energy do not consume ultimate or mutate effects',()=>{
 for(const kind of ['magic','support']){const c=make(kind),before=viewLiveCommanderCombat(c);assert.throws(()=>cast(c,kind,{targetIds:['missing']}));assert.deepEqual(viewLiveCommanderCombat(c),before);assert.equal(c.abilities.energy[0],100);cast(c,kind);}
 for(const kind of ['attack','defense','magic','support']){const c=make(kind);c.abilities.energy[0]=0;const before=viewLiveCommanderCombat(c);assert.throws(()=>cast(c,kind),/energy/);assert.deepEqual(viewLiveCommanderCombat(c),before);assert.deepEqual(c.ultimateUsed,[false,false]);}
});
test('low-level authoritative ability gate persists across views, is per-side and duplicate-safe',()=>{
 const s=createLiveCommanderAbilities({matchKey:'once-match',energy:[100,100],now:0});const req={side:0,ability:'ultimate',matchKey:'once-match',requestId:'ability_001',now:1000};
 castLiveCommanderAbility(s,req);grantLiveCommanderEnergy(s,0,100);assert.equal(castLiveCommanderAbility(s,req).duplicate,true);
 assert.throws(()=>castLiveCommanderAbility(s,{...req,requestId:'ability_002',now:7000}),/already used/);assert.equal(viewLiveCommanderAbilities(s,1,7000).canUseUltimate,true);
});
test('bots never choose already-used ultimate even with stale permissive ability flags',()=>{
 for(const kind of ['attack','defense','magic','support']){const c=make(kind);const s={...viewLiveCommanderCombat(c),ultimateUsed:[true,false],abilities:[{energy:100,canUseNormal:true,canUseUltimate:true},{}]};assert.notEqual(chooseBotCast(s,kind,'medium',{side:0,now:10000,startedAt:0,lastCastAt:0})?.ability,'ultimate');}
});

test('legacy simulation records per-side usage, rejects second ultimate and resets next match',async()=>{
 const {simulateBattle}=await import('../battle-engine.js');
 const team=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 for(const kind of ['attack','defense','magic']){
  const opts={seed:'ultimate-once',maxRounds:15,commanders:[{commanderId:kind,levels:{attack:40,defense:40,magic:40,support:40}},{commanderId:'defense',levels:{attack:0,defense:0,magic:0,support:0}}]};
  const first={side:0,round:4,ability:'ultimate',...(kind==='magic'?{targetIds:['a0']}:{})};
  const one=simulateBattle(team('a'),team('b'),{...opts,commanderActions:[first]});assert.deepEqual(one.ultimateUsed,[true,false]);
  assert.throws(()=>simulateBattle(team('a'),team('b'),{...opts,commanderActions:[first,{...first,round:9}]}),/already used/);
  assert.deepEqual(simulateBattle(team('a'),team('b'),{...opts,commanderActions:[]}).ultimateUsed,[false,false]);
 }
});
