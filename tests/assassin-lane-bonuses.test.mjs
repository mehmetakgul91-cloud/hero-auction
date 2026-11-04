import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {battleRoster} from '../battle-roster.js';
import {commanderOriginalRoster} from '../commander-original-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {preferredLane,buildDefaultFormation,validateFormation} from '../public/preparation-formation.js';
import {selectBattleTarget} from '../battle-target-selection.js';

// Approved swaps from main d6c04ccc51bf06e875a51529586a0b51ac48387b.
// Pin old values independently so reversing only these swaps reconstructs the
// complete baseline, including every other hero, ability and roster field.
const swaps={
 'original:expansion-02':{front:.04,back:-.03},
 'original:expansion-12':{front:.05,back:-.04},
 'original:expansion-19':{front:.06,back:-.05},
 'original:expansion-26':{front:.06,back:-.03},
 'original:expansion-30':{front:.04,back:.02},
 'original:expansion-32':{front:.05,back:-.04},
};
const unchanged={
 'original:05':{front:-.08,back:.07},
 'original:12':{front:-.07,back:.09},
 'original:expansion-18':{front:.03,back:.05},
 'original:expansion-20':{front:-.03,back:.06},
};
const expected={...unchanged,...Object.fromEntries(Object.entries(swaps).map(([id,{front,back}])=>[id,{front:back,back:front}]))};
const baselineHashes={
 'battle-roster.json':'278bd3aa11160801f30c6ee66f9965ff6983f22397555146b476224ac38361d7',
 'commander-original-roster.json':'4d2f30cd9d5014b1c8f4bd146d663b2197d0e34b5836524b72f6d8307f576bd7',
};

for(const [file,hash] of Object.entries(baselineHashes))test(`${file}: exactly six approved lane swaps and no other roster changes`,()=>{
 const roster=JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 assert.equal(roster.characters.length,50);
 const assassins=roster.characters.filter(hero=>hero.role==='assassin');
 assert.deepEqual(assassins.map(hero=>hero.id).sort(),Object.keys(expected).sort());
 for(const hero of assassins)assert.deepEqual(hero.laneModifiers,expected[hero.id],hero.name);
 let reversed=0;
 for(const hero of roster.characters)if(swaps[hero.id]){hero.laneModifiers={...swaps[hero.id]};reversed++;}
 assert.equal(reversed,6);
 assert.equal(createHash('sha256').update(JSON.stringify(roster)).digest('hex'),hash,
  'all other heroes, stats, abilities, powers, portraits and roster metadata must remain unchanged');
});

test('both roster adapters expose identical assassin metadata and all ten prefer the rear',()=>{
 const assassins=battleRoster.filter(hero=>hero.role==='assassin');
 assert.deepEqual(assassins,commanderOriginalRoster.filter(hero=>hero.role==='assassin'));
 for(const hero of assassins)assert.equal(preferredLane(hero),'back',hero.name);
 for(let start=0;start<assassins.length;start+=5){
  const team=assassins.slice(start,start+5),formation=buildDefaultFormation(team);
  assert.deepEqual(formation.positions,[0,1,2,3,4],'acquisition order is not changed');
  assert.deepEqual(formation.lanes,Array(5).fill('back'));
  assert.ok(validateFormation(formation,team),'existing five-back formation remains legal');
 }
});

for(const hero of battleRoster.filter(hero=>hero.role==='assassin')){
 test(`${hero.name}: actual live preparation applies the exact front/back stats in both adapters`,()=>{
  const teammates=['tank','fighter','energy','support'].map(role=>battleRoster.find(h=>h.role===role));
  for(const cardAdapter of ['auction','original'])for(const lane of ['front','back']){
   const cards=[hero,...teammates].map(h=>({id:h.id,power:100,lane:h.id===hero.id?lane:preferredLane(h)}));
   const before=structuredClone(cards);
   const teams=prepareLiveArenaTeams(cards,cards,{cardAdapter});
   assert.deepEqual(cards,before,'preparation must not mutate submitted cards');
   const multiplier=1+expected[hero.id][lane];
   for(const team of teams){
    const actual=team[0],stat=Math.round(100*multiplier);
    assert.equal(actual.lane,lane);
    assert.equal(actual.role,'assassin');
    assert.equal(actual.compositionMultiplier,multiplier);
    assert.equal(actual.attack,stat);
    assert.equal(actual.defense,stat);
    assert.equal(actual.maxHp,Math.round(200*multiplier));
    assert.equal(actual.hp,actual.maxHp);
    assert.equal(actual.speed,Math.round(stat*(1+hero.passive.value)));
    assert.deepEqual(actual.active,hero.active);
    assert.deepEqual(actual.passive,hero.passive);
   }
  }
 });
}

test('assassins keep enemy rear targeting regardless of their own lane',()=>{
 const enemies=[{id:'enemy-front',position:0,lane:'front',hp:100},{id:'enemy-back',position:1,lane:'back',hp:100}];
 for(const hero of battleRoster.filter(h=>h.role==='assassin'))for(const lane of ['front','back']){
  assert.equal(selectBattleTarget(enemies,{...hero,position:0,lane},1).id,'enemy-back');
 }
});
