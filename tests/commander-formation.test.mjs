import test from 'node:test';
import assert from 'node:assert/strict';
import {captureCommanderFormation} from '../public/commander-formation.js';
import {getArenaLaneLayout} from '../public/arena-viewport.js';

const teamFor=(front,back)=>[
 ...Array.from({length:front},(_,i)=>({id:`f${i}`,lane:'front',hp:100})),
 ...Array.from({length:back},(_,i)=>({id:`b${i}`,lane:'back',hp:100})),
];

// Independently derive centers and spacing from the actual renderer's CSS rows.
function rendererNeighbors(team){
 const layout=getArenaLaneLayout([team]).teams[0],indices={front:0,back:0};
 const slots=team.map(hero=>{
  const lane=hero.lane==='front'?'front':'back',index=indices[lane]++;
  const [start,span]=layout[lane][index].split(' / span ').map(Number);
  return {id:hero.id,lane,index,center:start+span/2,span};
 });
 return Object.fromEntries(slots.map(a=>[a.id,slots.filter(b=>a.lane===b.lane
  ?Math.abs(a.index-b.index)===1
  :Math.abs(a.center-b.center)<=Math.min(a.span,b.span)
 ).map(b=>b.id)]));
}

test('every legal lane count and interleaving matches renderer centers, symmetry and reflection',()=>{
 let formations=0;
 for(let count=0;count<=5;count++)for(let mask=0;mask<2**count;mask++){
  const team=Array.from({length:count},(_,i)=>({id:`h${i}`,lane:mask&(1<<i)?'front':'back'}));
  const actual=captureCommanderFormation(team);
  assert.deepEqual(actual,rendererNeighbors(team),`count ${count}, mask ${mask}`);
  const reflected=captureCommanderFormation([...team].reverse());
  const swapped=captureCommanderFormation(team.map(h=>({...h,lane:h.lane==='front'?'back':'front'})));
  assert.deepEqual(swapped,actual,'swapping the two lanes preserves adjacency');
  for(const hero of team){
   assert.ok(!actual[hero.id].includes(hero.id));
   assert.equal(new Set(actual[hero.id]).size,actual[hero.id].length);
   assert.deepEqual(reflected[hero.id],[...actual[hero.id]].reverse());
   for(const neighbor of actual[hero.id])assert.ok(actual[neighbor].includes(hero.id),'adjacency is symmetric');
  }
  formations++;
 }
 assert.equal(formations,63);
});

test('2 front / 3 back includes the rear center and only the nearest front at each rear edge',()=>{
 assert.deepEqual(captureCommanderFormation(teamFor(2,3)),{
  f0:['f1','b0','b1'],f1:['f0','b1','b2'],
  b0:['f0','b1'],b1:['f0','f1','b0','b2'],b2:['f1','b1'],
 });
});

test('1 front / 4 back selects only the middle two across the lane',()=>{
 assert.deepEqual(captureCommanderFormation(teamFor(1,4)),{
  f0:['b1','b2'],b0:['b1'],b1:['f0','b0','b2'],
  b2:['f0','b1','b3'],b3:['b2'],
 });
});

test('2 / 2 includes both cross-lane diagonals at the exact spacing boundary',()=>{
 assert.deepEqual(captureCommanderFormation(teamFor(2,2)),{
  f0:['f1','b0','b1'],f1:['f0','b0','b1'],
  b0:['f0','f1','b1'],b1:['f0','f1','b0'],
 });
});

test('0 / 5 and 5 / 0 have only immediate same-lane neighbors',()=>{
 for(const [front,back,prefix] of [[0,5,'b'],[5,0,'f']]){
  const formation=captureCommanderFormation(teamFor(front,back));
  for(let i=0;i<5;i++)assert.deepEqual(formation[`${prefix}${i}`],
   [i-1,i+1].filter(j=>j>=0&&j<5).map(j=>`${prefix}${j}`));
 }
 assert.deepEqual(captureCommanderFormation([]),{});
});

test('original full-team order and dead slots survive mutation, removal, revival and reordering',()=>{
 const team=teamFor(2,3),[f0,f1,b0,b1,b2]=team;
 b1.hp=0;
 const original=[b0,f0,b1,f1,b2],formation=captureCommanderFormation(original);
 assert.deepEqual(formation.b1,['b0','f0','f1','b2']);
 assert.deepEqual(formation.b0,['f0','b1']);
 assert.ok(!formation.b0.includes('b2'),'must not jump over a dead middle hero');
 const snapshot=JSON.stringify(formation);
 original.splice(2,1);original.reverse();
 b1.hp=100;b1.lane='front';b0.id='changed';f0.hp=0;
 original.push({id:'replacement',lane:'back'});
 assert.equal(JSON.stringify(formation),snapshot);
 assert.ok(Object.hasOwn(formation,'b1'));
 assert.ok(!Object.hasOwn(formation,'replacement'));
});

test('only explicit front goes to front; missing and unknown lanes match the renderer',()=>{
 const team=[{id:'a'},{id:'b',lane:null},{id:'c',lane:'other'},{id:'d',lane:'front'}];
 assert.deepEqual(captureCommanderFormation(team),rendererNeighbors(team));
});

test('snapshot is deeply frozen, has only IDs, leaves input mutable and safely supports special IDs',()=>{
 const team=['__proto__','constructor','toString',''].map(id=>({id,lane:'back',metadata:{mutable:true}}));
 const formation=captureCommanderFormation(team);
 assert.equal(Object.getPrototypeOf(formation),Object.prototype);
 assert.deepEqual(Object.keys(formation),team.map(h=>h.id));
 assert.deepEqual(formation.__proto__,['constructor']);
 assert.ok(Object.isFrozen(formation));
 assert.throws(()=>{formation.extra=[];},TypeError);
 for(const neighbors of Object.values(formation)){
  assert.ok(Object.isFrozen(neighbors));
  assert.ok(neighbors.every(id=>typeof id==='string'));
  assert.throws(()=>neighbors.push('new'),TypeError);
 }
 assert.ok(!Object.isFrozen(team));
 assert.ok(team.every(hero=>!Object.isFrozen(hero)&&!Object.isFrozen(hero.metadata)));
});

test('rejects non-arrays, oversized teams, non-string/missing IDs, sparse entries and duplicate IDs',()=>{
 for(const value of [undefined,null,{},'team',new Set()])assert.throws(()=>captureCommanderFormation(value),TypeError);
 assert.throws(()=>captureCommanderFormation(teamFor(6,0)),RangeError);
 for(const hero of [undefined,null,{}, {id:1},{id:null},{id:Symbol('id')},{id:new String('id')}]){
  assert.throws(()=>captureCommanderFormation([hero]),TypeError);
 }
 assert.throws(()=>captureCommanderFormation(new Array(2)),TypeError);
 assert.throws(()=>captureCommanderFormation([{id:'same',lane:'front'},{id:'same',lane:'back'}]),TypeError);
 assert.throws(()=>captureCommanderFormation([{id:'__proto__'},{id:'__proto__'}]),TypeError);
});
