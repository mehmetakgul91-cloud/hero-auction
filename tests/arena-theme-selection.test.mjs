import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ARENA_THEME_IDS,ARENA_THEME_CATALOG_IDS,fallbackArenaTheme,validatedArenaPresentation,createArenaThemePresentation} from '../public/arena-theme.js';
import {arenaMatchKey,startRoomArenaTheme,roomArenaPresentation} from '../arena-theme.js';
import {crazyGamesSource} from '../crazygames-build.js';

const room=(extra={})=>({code:'123',created:1793000000000,matchNumber:1,players:[{token:'a'},{token:'b'}],...extra});
const fixture=()=>{let writes=0;const dataset={};const attributes={};const element={dataset:new Proxy(dataset,{set(object,key,value){writes++;object[key]=value;return true}}),setAttribute(key,value){writes++;attributes[key]=value}};return {element,dataset,attributes,writes:()=>writes}};

test('forest and savanna cosmetic draw has exact distribution bounds; returned objects do not mutate room storage',()=>{
 const counts=Object.fromEntries(ARENA_THEME_IDS.map(id=>[id,0]));
 for(let sample=0;sample<600;sample++){
  const r=room({code:String(sample)}),view=startRoomArenaTheme(r,{randomIndex:bound=>{assert.equal(bound,2);return sample%bound}});
  assert.equal(view.matchKey,arenaMatchKey(r));assert.equal(view.version,1);counts[view.theme]++;
  view.theme='invalid';assert.ok(ARENA_THEME_IDS.includes(r.arenaPresentation.theme));
 }
 assert.deepEqual(counts,{ruins:300,savanna:300});
 for(const invalid of [-1,2,3,5,Infinity,NaN,.5])assert.throws(()=>startRoomArenaTheme(room(),{randomIndex:()=>invalid}),RangeError);
});
test('both active scenes draw once; polling, roster swaps, sides and serialized reload retain the scene',()=>{
 for(const initial of [0,1]){
  const r=room();let draws=0;const rng=()=>{draws++;return initial};
  const first=startRoomArenaTheme(r,{randomIndex:rng});
  for(let i=0;i<1000;i++){
   r.round=i;r.players.reverse();r.battleSync={key:'ignored',ready:[i,i]};
   assert.deepEqual(startRoomArenaTheme(r,{randomIndex:rng}),first);
   assert.deepEqual(roomArenaPresentation(r),first);
  }
  assert.equal(draws,1);assert.deepEqual(roomArenaPresentation(JSON.parse(JSON.stringify(r))),first);
 }
});
test('new rooms draw independently and both active scenes rematch into the other scene',()=>{
 for(const initial of [0,1])for(const nextIndex of [0]){
  const r=room(),first=startRoomArenaTheme(r,{randomIndex:bound=>{assert.equal(bound,2);return initial}});
  r.matchNumber++;r.created++;
  const second=startRoomArenaTheme(r,{randomIndex:bound=>{assert.equal(bound,1);return nextIndex}});
  assert.equal(second.theme,ARENA_THEME_IDS.filter(theme=>theme!==first.theme)[nextIndex]);
  assert.notEqual(second.theme,first.theme);assert.notEqual(second.matchKey,first.matchKey);
  const unrelated=startRoomArenaTheme(room({code:'456'}),{randomIndex:bound=>{assert.equal(bound,2);return initial}});
  assert.equal(unrelated.theme,first.theme,'unrelated room does not share previous-theme state');
 }
 for(const invalid of [-1,1,2,Infinity,NaN,.5]){
  const r=room();startRoomArenaTheme(r,{randomIndex:()=>0});r.matchNumber++;
  const before=JSON.stringify(r.arenaPresentation);
  assert.throws(()=>startRoomArenaTheme(r,{randomIndex:()=>invalid}),RangeError);
  assert.equal(JSON.stringify(r.arenaPresentation),before,'invalid cosmetic draw never overwrites room metadata');
 }
});
test('legacy or stale persisted metadata falls back deterministically without mutating room state',()=>{
 const r=room(),before=JSON.stringify(r),expected=fallbackArenaTheme(arenaMatchKey(r));
 assert.equal(roomArenaPresentation(r).theme,expected);assert.equal(JSON.stringify(r),before);
 const restored=JSON.parse(before);restored.players.reverse();assert.equal(roomArenaPresentation(restored).theme,expected);
 for(const extra of [{theme:'unknown',version:1,matchKey:arenaMatchKey(r)},{theme:'fjord',version:1,matchKey:'old:room:1'},{theme:'ruins',version:2,matchKey:arenaMatchKey(r)}])assert.equal(roomArenaPresentation({...r,arenaPresentation:extra}).theme,expected);
 assert.equal(fallbackArenaTheme('legacy-preview'),fallbackArenaTheme('legacy-preview'));
});
test('client validates whitelist, version and exact current room context before touching DOM',()=>{
 const h=fixture(),presenter=createArenaThemePresentation({element:h.element}),key='123:1:1793000000000';
 for(const value of [{version:1,matchKey:key,theme:'https://evil.test/a.svg'},{version:2,matchKey:key,theme:'ruins'},{version:1,matchKey:'456:1:1793000000000',theme:'ruins'},{version:1,matchKey:'123:0:1793000000000',theme:'fjord'}])assert.equal(presenter.apply(value,key),null);
 for(const invalid of ['',null,' ', 'x'.repeat(201),'key\nscript'])assert.equal(validatedArenaPresentation(null,invalid),null);
 assert.equal(h.writes(),0);assert.equal(presenter.current(),null);
});
test('client changes only cosmetic attributes once per match, never flips during repeated snapshots',()=>{
 const h=fixture(),p=createArenaThemePresentation({element:h.element}),first={version:1,matchKey:'123:1:1',theme:'ruins'};
 assert.deepEqual(p.apply(first,first.matchKey),first);const writes=h.writes();
 for(let n=0;n<1000;n++)assert.deepEqual(p.apply({...first,theme:ARENA_THEME_CATALOG_IDS[n%5]},first.matchKey),first);
 assert.equal(h.writes(),writes);assert.equal(h.dataset.arenaTheme,'ruins');assert.match(h.attributes['aria-label'],/Orman harabeleri/);
 assert.equal(p.apply({...first,matchKey:'old'},first.matchKey),null);
 const next={version:1,matchKey:'123:2:2',theme:'savanna'};assert.deepEqual(p.apply(next,next.matchKey),next);
 assert.equal(h.dataset.arenaTheme,'savanna');assert.match(h.attributes['aria-label'],/Afrika savanası/);assert.equal(h.writes(),writes+2);assert.deepEqual(Object.keys(p.current()).sort(),['matchKey','theme','version']);
 const copy=p.current();copy.theme='courtyard';assert.equal(p.current().theme,'savanna');
 const viking={version:1,matchKey:'123:3:3',theme:'fjord'},normalized={...viking,theme:fallbackArenaTheme(viking.matchKey)};
 assert.deepEqual(p.apply(viking,viking.matchKey),normalized);assert.equal(h.writes(),writes+4);assert.notEqual(h.dataset.arenaTheme,'fjord');assert.doesNotMatch(h.attributes['aria-label'],/Viking/);
 for(const theme of ARENA_THEME_IDS)assert.deepEqual(p.apply({...viking,theme},viking.matchKey),normalized);assert.equal(h.writes(),writes+4);
});
test('legacy client fallback is identical for two seats, reloads and preview keys, with English CG label',()=>{
 const key='123:1:1793000000000';const values=[];
 for(let n=0;n<3;n++){
  const h=fixture(),p=createArenaThemePresentation({element:h.element,language:'en'});
  values.push(p.apply(undefined,key));assert.match(h.attributes['aria-label'],/^Battle arena/);
 }
 assert.deepEqual(values[0],values[1]);assert.deepEqual(values[1],values[2]);
 assert.equal(createArenaThemePresentation().apply(undefined,key),null);
});
test('presentation code has no combat dependency, per-frame effects, storage, navigation or network mutation',()=>{
 const client=readFileSync(new URL('../public/arena-theme.js',import.meta.url),'utf8'),server=readFileSync(new URL('../arena-theme.js',import.meta.url),'utf8');
 assert.doesNotMatch(client,/Math\.random|Date\.now|requestAnimationFrame|setInterval|setTimeout|fetch\(|localStorage|sessionStorage|innerHTML|appendChild|\.style\b/);
 assert.doesNotMatch(server,/battle-engine|battle-roster|Math\.random|seed\s*:/);
 assert.match(server,/import \{randomInt\} from 'node:crypto'/);
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(source,/arenaTheme\.apply\(data\.arenaPresentation,auctionCode\+':'+/);
 assert.match(crazyGamesSource(source,'.js'),/from '\/crazygames\/arena-theme\.js'/);
 assert.doesNotMatch(source,/query\.get\(['"](?:arenaTheme|theme)['"]\)/);
});

test('saved active scenes stay unchanged and retired scenes normalize to a shared active fallback without rewriting rooms',()=>{
 assert.deepEqual(ARENA_THEME_IDS,['ruins','savanna']);assert.deepEqual(ARENA_THEME_CATALOG_IDS,['courtyard','savanna','fjord','ruins','space']);
 for(const theme of ARENA_THEME_CATALOG_IDS){
  const r=room();r.arenaPresentation={version:1,matchKey:arenaMatchKey(r),theme};const before=JSON.stringify(r);
  const expected=ARENA_THEME_IDS.includes(theme)?theme:fallbackArenaTheme(arenaMatchKey(r));
  for(let n=0;n<3;n++){
   const view=roomArenaPresentation(JSON.parse(before));assert.equal(view.theme,expected);
   const f=fixture(),p=createArenaThemePresentation({element:f.element});
   assert.equal(p.apply(r.arenaPresentation,arenaMatchKey(r)).theme,expected);assert.equal(f.dataset.arenaTheme,expected);
   assert.equal(startRoomArenaTheme(r,{randomIndex:()=>{throw Error('must not redraw saved match')}}).theme,expected);
  }
  assert.equal(JSON.stringify(r),before);
 }
});
test('hundreds of two-scene rematches alternate safely without empty random bounds',()=>{
 const r=room();let last=null,previous=null;const seen=new Set();
 for(let n=0;n<600;n++){
  const expected=ARENA_THEME_IDS[n%2],choices=ARENA_THEME_IDS.filter(theme=>theme!==previous);
  r.matchNumber=n+1;
  const view=startRoomArenaTheme(r,{randomIndex:bound=>{assert.equal(bound,n===0?2:1);return choices.indexOf(expected)}});
  assert.equal(view.theme,expected);assert.notEqual(view.theme,previous);assert.notEqual(view.matchKey,last);seen.add(view.theme);
  for(const seat of [0,1]){
   const f=fixture(),p=createArenaThemePresentation({element:f.element,language:seat?'en':'tr'});
   assert.deepEqual(p.apply(roomArenaPresentation(JSON.parse(JSON.stringify(r))),view.matchKey),view);
  }
  last=view.matchKey;previous=view.theme;
 }
 assert.equal(seen.size,2);
});
test('legacy fallback covers only both active themes deterministically across seats and match identities',()=>{
 const counts={ruins:0,savanna:0};
 for(let n=0;n<500;n++){
  const r=room({code:String(n)}),key=arenaMatchKey(r),theme=fallbackArenaTheme(key);counts[theme]++;
  assert.ok(ARENA_THEME_IDS.includes(theme));
  const seats=[fixture(),fixture()].map(f=>createArenaThemePresentation({element:f.element}));
  for(const p of seats)assert.equal(p.apply(undefined,key).theme,theme);
  assert.equal(roomArenaPresentation(JSON.parse(JSON.stringify(r))).theme,theme);
 }
 assert.ok(Object.values(counts).every(count=>count>150&&count<350),'legacy fallback reaches all active scenes with bounded counts');
});
test('both active authoritative themes survive independent player presenters, serialization and refreshed presenters',()=>{
 for(const theme of ARENA_THEME_IDS){
  const r=room();r.arenaPresentation={version:1,matchKey:arenaMatchKey(r),theme};
  for(let seat=0;seat<2;seat++)for(let reload=0;reload<3;reload++){
   const f=fixture(),p=createArenaThemePresentation({element:f.element,language:seat?'en':'tr'});
   assert.deepEqual(p.apply(JSON.parse(JSON.stringify(r.arenaPresentation)),arenaMatchKey(r)),r.arenaPresentation);
   assert.equal(f.dataset.arenaTheme,theme);
  }
 }
});

test('saved Viking matches normalize on both seats without changing combat snapshots or drawing entropy',()=>{
 for(let sample=0;sample<40;sample++){
  const r=room({code:String(sample),battleSync:{seed:71,round:4,result:{winner:1,hp:[120,0]}},matchSettled:true});
  r.arenaPresentation={version:1,matchKey:arenaMatchKey(r),theme:'fjord'};
  const before=JSON.stringify(r),expected=fallbackArenaTheme(arenaMatchKey(r));
  for(let reload=0;reload<3;reload++)for(const language of ['tr','en']){
   const restored=JSON.parse(before),h=fixture(),p=createArenaThemePresentation({element:h.element,language});
   const view=roomArenaPresentation(restored);
   assert.equal(view.theme,expected);assert.ok(ARENA_THEME_IDS.includes(expected));
   assert.deepEqual(p.apply(restored.arenaPresentation,arenaMatchKey(restored)),view);
   assert.deepEqual(startRoomArenaTheme(restored,{randomIndex:()=>{throw Error('no redraw on restored Viking match')}}),view);
   assert.equal(JSON.stringify(restored),before,'presentation must not rewrite the saved scene, seed, result or settlement');
  }
  for(const nextIndex of [0,1]){
   const next=JSON.parse(before);next.matchNumber++;
   const view=startRoomArenaTheme(next,{randomIndex:bound=>{assert.equal(bound,2);return nextIndex}});
   assert.equal(view.theme,ARENA_THEME_IDS[nextIndex]);assert.notEqual(view.matchKey,r.arenaPresentation.matchKey);
   assert.deepEqual(next.battleSync,r.battleSync);assert.equal(next.matchSettled,true);
  }
 }
});
