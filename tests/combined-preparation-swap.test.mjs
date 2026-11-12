import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {swapSameLaneHeroes,preparationCenterSlot,validateFormation} from '../public/preparation-formation.js';
import {createCombinedPreparationState,mountCombinedPreparation} from '../public/combined-preparation.js';
import {createPreparationDraft} from '../public/preparation-draft.js';
import {preparationDocument} from './helpers/preparation-dom.mjs';
const team=['tank','fighter','energy','assassin','support'].map((role,i)=>({id:'h'+i,name:['Gök Çekici','Kuzgun Hançer','Kristal Şifacı','Altın Ozan','Fırtına Çağıran'][i],role}));
const formation={positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:team.map(h=>h.role)};
const levels={attack:30,defense:25,magic:40,support:30};
const profile=commanderId=>({commanderId,levels});
const payload=(f=formation,extra={})=>{
 const heroes=f.positions.map((index,slot)=>({...team[index],lane:f.lanes[slot],attack:100+index,defense:110+index,maxHp:200+index,speed:90+index,healingRate:team[index].role==='support'?40:0,healingPower:team[index].role==='support'?42:0}));
 const totals=heroes=>Object.fromEntries(['attack','defense','maxHp','speed','healingPower'].map(key=>[key,heroes.reduce((sum,h)=>sum+h[key],0)]));
 return {matchKey:'m1',preparation:{...structuredClone(f),ready:false},selection:null,ready:[false,false],started:false,baseline:{heroes,totals:totals(heroes)},options:['attack','defense','magic','support'].map(commanderId=>{const boosted=heroes.map(h=>({...h,attack:h.attack+7,defense:h.defense+6,maxHp:h.maxHp+13,healingRate:h.healingRate+(commanderId==='support'&&h.role==='support'?15:0),healingPower:h.healingPower+(commanderId==='support'&&h.role==='support'?15:0)}));return {commanderId,profile:profile(commanderId),heroes:boosted,totals:totals(boosted)}}),...extra};
};
const setup=extra=>createCombinedPreparationState({matchKey:'m1',team,preparation:formation,request:async(_kind,p)=>payload(p.formation),...extra});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('all lane masks and permutations keep identities, roles and lanes aligned after legal swaps',()=>{
 const permutations=values=>values.length?values.flatMap((x,i)=>permutations(values.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]];
 for(const positions of permutations([0,1,2,3,4]))for(let mask=0;mask<32;mask++){
  const f={positions,lanes:positions.map((_,slot)=>mask&(1<<slot)?'front':'back'),roles:positions.map(i=>team[i].role)},before=structuredClone(f);
  for(let first=0;first<5;first++)for(let second=0;second<5;second++){
   const next=swapSameLaneHeroes(f,team,first,second),legal=first!==second&&f.lanes[first]===f.lanes[second];
   assert.equal(!!next,legal);if(next){assert.ok(validateFormation(next,team));assert.deepEqual(next.lanes,f.lanes);assert.equal(next.positions[second],f.positions[first]);assert.equal(next.roles[second],team[f.positions[first]].role);}
  }
  assert.deepEqual(f,before);
 }
});
test('center hint exists only for 2+3 and follows the second rear slot, not hero role or array index',()=>{
 for(let mask=0;mask<32;mask++){
  const lanes=formation.lanes.map((_,slot)=>mask&(1<<slot)?'front':'back'),f={...formation,lanes},rear=lanes.flatMap((lane,slot)=>lane==='back'?[slot]:[]);
  assert.equal(preparationCenterSlot(f),rear.length===3?rear[1]:null);
 }
 const f={positions:[4,2,0,3,1],lanes:['back','front','back','front','back'],roles:[4,2,0,3,1].map(i=>team[i].role)};
 assert.equal(preparationCenterSlot(f),2);const swapped=swapSameLaneHeroes(f,team,0,2);assert.equal(swapped.positions[preparationCenterSlot(swapped)],4);
});
test('first tap selects, same tap cancels, and a cross-lane tap never swaps heroes',async()=>{
 const saved=[],s=setup({saveDraft:f=>saved.push(f)});await s.refresh();s.selectHero(2);assert.equal(s.snapshot().selectedHeroSlot,2);s.selectHero(2);assert.equal(s.snapshot().selectedHeroSlot,null);
 s.selectHero(2);s.selectHero(0);assert.equal(s.snapshot().selectedHeroSlot,0);assert.deepEqual(s.snapshot().formation,formation);assert.equal(saved.length,0);
 for(const invalid of [-1,5,NaN,1.5,null,'2'])s.selectHero(invalid);assert.equal(s.snapshot().selectedHeroSlot,0);
});
test('a single hero can be selected and moved without swapping',async()=>{
 const s=setup({preparation:{...formation,lanes:['front','back','back','back','back']}});await s.refresh();s.selectHero(0);assert.equal(s.snapshot().selectedHeroSlot,0);s.move(0,'back');assert.equal(s.snapshot().formation.lanes.filter(l=>'front'===l).length,0);
});
test('second same-row tap swaps positions and roles, preserves commander, saves and previews exact order',async()=>{
 const saved=[],calls=[],s=setup({saveDraft:f=>saved.push(f),request:async(kind,p)=>{calls.push(p.formation);return payload(p.formation)}});await s.refresh();s.select('magic');s.selectHero(2);s.selectHero(3);
 assert.equal(s.snapshot().selectedHeroSlot,null);assert.equal(s.snapshot().selected,'magic');assert.equal(s.snapshot().previewPending,true);assert.equal(s.snapshot().baseline,null);
 const expected={...formation,positions:[0,1,3,2,4],roles:['tank','fighter','assassin','energy','support']};assert.deepEqual(s.snapshot().formation,expected);assert.deepEqual(saved,[expected]);await flush();assert.deepEqual(calls.at(-1),expected);assert.deepEqual(s.snapshot().baseline.heroes.map(h=>h.id),['h0','h1','h3','h2','h4']);
});
test('rapid swaps and stale preview responses cannot revert the final order',async()=>{
 let release,count=0;const s=setup({request:async(_kind,p)=>{if(++count===2)await new Promise(r=>release=r);return payload(p.formation)}});await s.refresh();s.selectHero(2);s.selectHero(3);s.selectHero(3);s.selectHero(4);assert.deepEqual(s.snapshot().formation.positions,[0,1,3,4,2]);release();await flush();await flush();assert.deepEqual(s.snapshot().baseline.heroes.map(h=>h.id),['h0','h1','h3','h4','h2']);assert.equal(count,3);
});
test('lane move cancels the selection and does not reorder the newly swapped roster',async()=>{
 const s=setup();await s.refresh();s.selectHero(2);s.selectHero(3);await flush();s.selectHero(3);s.move(3,'front');assert.equal(s.snapshot().selectedHeroSlot,null);assert.deepEqual(s.snapshot().formation.positions,[0,1,3,2,4]);assert.equal(s.snapshot().formation.roles[3],'energy');assert.equal(s.snapshot().formation.lanes[3],'front');await flush();assert.equal(preparationCenterSlot(s.snapshot().formation),null);
});
test('pending swaps persist with exact roster and match, restore, and confirm after draft flush',async()=>{
 const storageData=new Map(),storage={getItem:k=>storageData.get(k),setItem:(k,v)=>storageData.set(k,v),removeItem:k=>storageData.delete(k)};
 const draft=createPreparationDraft({matchKey:'m1',team,storage,save:async()=>{throw Error('offline')}});
 const s=setup({saveDraft:draft.save});await s.refresh();s.selectHero(2);s.selectHero(4);await flush();const restored=createPreparationDraft({matchKey:'m1',team,storage,save:async()=>{}}).pending();assert.deepEqual(restored.positions,[0,1,4,3,2]);
 const events=[],s2=setup({preparation:restored,beforeConfirm:async()=>events.push('flushed'),request:async(kind,p)=>{if(kind==='confirm')events.push(structuredClone(p));return payload(p.formation,kind==='confirm'?{selection:profile('magic'),preparation:{...p.formation,ready:true}}:{})}});await s2.refresh();s2.select('magic');await s2.confirm();assert.equal(events[0],'flushed');assert.deepEqual(events[1].formation,restored);assert.ok(s2.snapshot().locked);
});
test('locked, busy, uncertain, disposed and stale-match states block swaps',async()=>{
 for(const flag of ['ready','locked','busy','uncertain','disposed','stale']){
  let release;const s=setup({preparation:{...formation,ready:flag==='ready'},request:async(kind,p)=>{if(kind==='confirm'&&flag==='busy')await new Promise(r=>release=r);if(flag==='uncertain')throw Error('offline');return payload(p.formation)}});
  if(flag==='uncertain')s.resolve(payload());else await s.refresh();s.selectHero(2);
  if(flag==='locked')s.resolve(payload(formation,{selection:profile('magic')}));
  if(flag==='stale')assert.throws(()=>s.resolve({...payload(),matchKey:'bad'}));
  if(flag==='disposed')s.destroy();
  let confirmation;if(['busy','uncertain'].includes(flag)){s.select('magic');confirmation=s.confirm();if(flag==='uncertain')await confirmation;}
  if(flag==='stale'){const stale=setup({request:async()=>({...payload(),matchKey:'bad'})});await stale.refresh();stale.selectHero(2);stale.selectHero(3);assert.deepEqual(stale.snapshot().formation.positions,formation.positions);continue;}
  s.selectHero(3);assert.deepEqual(s.snapshot().formation.positions,formation.positions,flag);
  if(release){release();await confirmation;}
 }
});

async function mounted(english=false){
 const prior={window:globalThis.window,location:globalThis.location,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.location={href:'http://fixture.invalid'};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 const dom=preparationDocument(),calls=[];let locked=null;
 const picker=mountCombinedPreparation({root:dom.root,english,team,preparation:formation,code:'fixture',token:'synthetic',matchKey:'m1',getPortrait:async i=>'/images/test-'+i+'.webp',onStarted:()=>{},getAuthToken:()=> 'synthetic',fetcher:async(url,init)=>{const p=JSON.parse(init.body);calls.push({url,...p});if(url.endsWith('/battle-auction-commander'))locked=profile(p.commanderId);return {ok:true,json:async()=>payload(p.formation,locked?{selection:locked,preparation:{...p.formation,ready:true}}:{})}}});await flush();
 return {...dom,picker,calls,close(){picker.destroy();Object.assign(globalThis,prior)}};
}
test('real component renders five portrait buttons, roles, new move labels and center on correct hero',async()=>{
 const h=await mounted();try{
  assert.equal(h.root.querySelectorAll('.combined-hero-pick').length,5);assert.equal(h.root.querySelectorAll('.combined-hero-role').length,5);assert.equal(h.root.querySelectorAll('.combined-portrait').length,5);
  assert.equal(h.root.querySelector('.combined-move').hidden,true);
  h.root.querySelector('.combined-hero-pick').click();assert.equal(h.root.querySelector('.combined-move').textContent,'↓ Arkaya al');
  assert.equal(h.root.querySelectorAll('.combined-center-badge').length,1);assert.equal(h.root.querySelector('.combined-center-badge').parentNode.dataset.heroId,'h3');
  assert.ok(h.root.querySelectorAll('.combined-hero-pick').every(n=>n.tagName==='BUTTON'&&!n.querySelector('button')));
 }finally{h.close()}
});
test('component swap updates card order, center badge, role, focus and per-hero engine values without confirming',async()=>{
 const h=await mounted();try{
  h.root.querySelectorAll('.combined-choice')[2].click();h.root.querySelector('.combined-hero-pick[data-slot="2"]').click();assert.equal(h.root.querySelector('.combined-hero-pick[data-slot="2"]').attributes['aria-pressed'],'true');assert.match(h.root.querySelector('.combined-formation-note').textContent,/Kristal Şifacı/);
  h.root.querySelector('.combined-hero-pick[data-slot="3"]').click();await flush();
  assert.deepEqual(h.root.querySelectorAll('.combined-hero').map(n=>n.dataset.heroId),['h0','h1','h3','h2','h4']);assert.equal(h.root.querySelector('.combined-center-badge').parentNode.dataset.heroId,'h2');
  assert.equal(h.document.activeElement.dataset.heroId,'h3');assert.equal(h.document.activeElement.className,'combined-hero-pick');assert.equal(h.root.querySelectorAll('.combined-hero-pick').filter(n=>n.attributes['aria-pressed']==='true').length,0);
  const hero=h.root.querySelector('.combined-hero[data-hero-id="h3"]');assert.equal(hero.querySelector('.combined-hero-role').textContent,'Suikastçı');hero.querySelector('.combined-hero-pick').click();assert.match(h.root.querySelector('.combined-selection').textContent,/103 → 110/);assert.equal(h.calls.some(c=>c.url.endsWith('/battle-auction-commander')),false);
  h.root.querySelector('.combined-move').click();await flush();assert.equal(h.picker.state.snapshot().formation.lanes[2],'front');assert.equal(h.root.querySelectorAll('.combined-center-badge').length,0);assert.equal(h.document.activeElement.dataset.heroId,'h3');
 }finally{h.close()}
});
test('every distribution keeps all five cards and correct counts; no false center in single-lane rows',async()=>{
 const h=await mounted();try{
  for(const lane of ['front','back']){
   for(let slot=0;slot<5;slot++)h.picker.state.move(slot,lane);await flush();await flush();
   const row=h.root.querySelector('.combined-row[data-lane="'+lane+'"]');assert.equal(row.dataset.count,'5');assert.equal(row.querySelectorAll('.combined-hero').length,5);assert.equal(h.root.querySelectorAll('.combined-center-badge').length,0);assert.equal(h.root.querySelectorAll('.combined-empty').length,1);
  }
 }finally{h.close()}
});
test('English controls are localized, and locking disables both swap and move buttons',async()=>{
 const h=await mounted(true);try{
  h.root.querySelector('.combined-hero-pick').click();assert.equal(h.root.querySelector('.combined-move').textContent,'↓ Move back');assert.match(h.root.querySelector('.combined-center-badge').parentNode.attributes['aria-label'],/\+15% defense/);h.root.querySelectorAll('.combined-choice')[2].click();await h.picker.state.confirm();
  assert.ok(h.root.querySelectorAll('.combined-hero-pick').every(n=>n.disabled));assert.ok(h.root.querySelectorAll('.combined-move').every(n=>n.disabled));assert.match(h.root.querySelector('.combined-formation-note').textContent,/locked/);
 }finally{h.close()}
});
test('reset restores the roster defaults and clears the commander before locking',async()=>{
 const h=await mounted();try{
  h.root.querySelectorAll('.combined-choice')[2].click();h.picker.state.move(0,'back');await flush();
  h.root.querySelector('.combined-reset').click();await flush();assert.deepEqual(h.picker.state.snapshot().formation,formation);assert.equal(h.picker.state.snapshot().selected,null);
 }finally{h.close()}
});

for(const english of [false,true])test(`healing preview shows additive rate and healing amount in ${english?'English':'Turkish'}`,async()=>{
 const h=await mounted(english);try{
  h.root.querySelectorAll('.combined-choice')[3].click();
  const list=h.root.querySelector('.combined-comparisons');assert.match(list.textContent,/40 → 55\+15/);assert.match(list.textContent,/42 → 57\+15/);
  assert.match(list.textContent,english?/Healing rate/:/Şifa oranı/);
  h.root.querySelectorAll('.combined-choice')[0].click();assert.doesNotMatch(h.root.querySelector('.combined-comparisons').textContent,/Fırtına Çağıran/);
 }finally{h.close()}
});
