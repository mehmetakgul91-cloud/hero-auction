import {commanderMagicNormalDescription} from '../public/commander-magic-presentation.js';
import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {trainingCommanderResources,trainingCommanderEnemyTargets,trainingCommanderFriendlyTargets} from '../public/commander-training-resources.js';
import {commanderAbilityDescription} from '../public/commander-ability-rules.js';
import {translate} from '../public/crazygames-en.js';
test('training uses exact independent server pools, including casualty bonuses',()=>{
 const result={commanderResourcesByRound:[{round:3,energy:[24,100],ultimateEnergy:[64,88],ultimateUsed:[false,false]},{round:4,energy:[46,100],ultimateEnergy:[1,88],ultimateUsed:[true,false]}]};
 assert.deepEqual(trainingCommanderResources(result,3),{energy:24,ultimateEnergy:64,ultimateUsed:false});assert.deepEqual(trainingCommanderResources(result,4),{energy:46,ultimateEnergy:1,ultimateUsed:true});assert.equal(trainingCommanderResources(result,2),null);
});
test('missing/stale training snapshot never estimates resources from scripted actions',()=>{
 assert.equal(trainingCommanderResources(null,1),null);assert.equal(trainingCommanderResources({commanderResourcesByRound:[{round:1,energy:[1000,30],ultimateEnergy:[30,30],ultimateUsed:[false,false]}]},1),null);
 const html=readFileSync(new URL('../public/commander-training.html',import.meta.url),'utf8');assert.doesNotMatch(html,/energyAt|currentEnergy|commanderRoundEnergy/);assert.match(html,/pools\.ultimateEnergy/);assert.match(html,/ultimateUsed\?'Kullanıldı'/);assert.match(html,/\$\('reset'\)\.disabled=busy/);
});
test('commander descriptions distinguish normal spending and untouched ultimate charge in both languages',()=>{
 for(const commanderId of ['attack','defense','magic','support']){
  const cost=commanderId==='magic'?60:40;const text=commanderAbilityDescription({commanderId,levels:{[commanderId]:0}});assert.match(text,new RegExp(cost+' normal enerji harcar; ulti dolumu azalmaz'));assert.match(text,/Nihai \(\d+ ulti dolumu\)/);const en=translate(text);assert.match(en,new RegExp('Normal abilities spend '+cost+' normal energy; ultimate charge is unaffected'));assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u);
 }
});

test('shipped training controller uses separate charge through normal, rejected ultimate and reset',async()=>{
 const {runInNewContext}=await import('node:vm');const {getCommanderAbilityCost}=await import('../public/commander-ability-rules.js');
 const html=readFileSync(new URL('../public/commander-training.html',import.meta.url),'utf8'),source=html.split('<script type="module">')[1].split('</script>')[0].replace(/^import .*;\n/gm,'');
 class Node{style={};value='defense';disabled=false;textContent='';replaceChildren(){}append(){}}
 const nodes=new Map(),requests=[];const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)},createElement:()=>new Node()};
 runInNewContext(source,{commanderMagicNormalDescription,document,getCommanderAbilityCost,trainingCommanderResources,trainingCommanderEnemyTargets,trainingCommanderFriendlyTargets,commanderUltimateDescription,describeBattleEvent,fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 const flush=()=>new Promise(r=>setImmediate(r));const data=(changes=[])=>({rounds:15,teams:[[{id:'ally',name:'Ally',maxHp:100}],[]],log:[],commanderResourcesByRound:Array.from({length:15},(_,i)=>({round:i+1,energy:[Math.min(100,30+i*12),100],ultimateEnergy:[Math.min(100,30+i*12),100],ultimateUsed:[false,false],targets:[[{id:'ally',hp:100}],[]],...changes.find(c=>c.round===i+1)}))});
 const reply=async(index,value,ok=true)=>{requests[index].resolve({ok,json:async()=>value});await flush()};
 await reply(0,data());nodes.get('advance').onclick();assert.equal(nodes.get('energy-label').textContent,'Normal enerji: 42 / 100');
 const normal=nodes.get('normal').onclick();assert.equal(requests.length,2);await nodes.get('reset').onclick();assert.equal(requests.length,2);
 await reply(1,data([{round:2,energy:[2,100],ultimateEnergy:[42,100]}]));await normal;
 assert.equal(nodes.get('energy-label').textContent,'Normal enerji: 2 / 100');assert.equal(nodes.get('ultimate-energy-label').textContent,'Ulti dolumu: 42 / 100');
 for(let i=0;i<4;i++)nodes.get('advance').onclick();assert.equal(nodes.get('ultimate').disabled,true);nodes.get('focus-target').value='ally';nodes.get('focus-target').onchange();assert.equal(nodes.get('ultimate').disabled,false);
 const rejected=nodes.get('ultimate').onclick();await reply(2,{error:'invalid state'},false);await rejected;assert.equal(nodes.get('ultimate-energy-label').textContent,'Ulti dolumu: 90 / 100');assert.equal(nodes.get('ultimate').disabled,true);nodes.get('focus-target').value='ally';nodes.get('focus-target').onchange();assert.equal(nodes.get('ultimate').disabled,false);
 const ultimate=nodes.get('ultimate').onclick();await reply(3,data([{round:6,energy:[38,100],ultimateEnergy:[3,100],ultimateUsed:[true,false]},{round:7,energy:[50,100],ultimateEnergy:[3,100],ultimateUsed:[true,false]}]));await ultimate;
 assert.equal(nodes.get('ultimate-energy-label').textContent,'Ulti dolumu: Kullanıldı');assert.equal(nodes.get('ultimate-energy-fill').style.width,'0%');nodes.get('advance').onclick();assert.equal(nodes.get('normal').disabled,false);assert.equal(nodes.get('ultimate').disabled,true);
 const reset=nodes.get('reset').onclick();await reply(4,data());await reset;assert.equal(nodes.get('energy-label').textContent,'Normal enerji: 30 / 100');assert.equal(nodes.get('ultimate-energy-label').textContent,'Ulti dolumu: 30 / 100');assert.deepEqual(JSON.parse(requests[4].options.body).actions,[]);
});

for(const english of [false,true])test(`training commander changes update displayed normal price and 59/60 mage boundary (${english?'EN':'TR'})`,async()=>{
 const {runInNewContext}=await import('node:vm');const {getCommanderAbilityCost}=await import('../public/commander-ability-rules.js');
 const html=readFileSync(new URL('../public/commander-training.html',import.meta.url),'utf8'),source=html.split('<script type="module">')[1].split('</script>')[0].replace(/^import .*;\n/gm,'');
 class Node{style={};value='attack';disabled=false;textContent='';replaceChildren(){}append(){}}
 const nodes=new Map(),requests=[],document={documentElement:{lang:english?'en':'tr'},getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)},createElement:()=>new Node()};
 runInNewContext(source,{commanderMagicNormalDescription,document,getCommanderAbilityCost,trainingCommanderResources,trainingCommanderEnemyTargets,trainingCommanderFriendlyTargets,commanderUltimateDescription,describeBattleEvent,fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 const data=energy=>({rounds:15,teams:[[],[]],log:[],commanderResourcesByRound:[{round:1,energy:[energy,100],ultimateEnergy:[100,100],ultimateUsed:[false,false]}]});
 const reply=async energy=>{requests.at(-1).resolve({ok:true,json:async()=>data(energy)});await new Promise(resolve=>setImmediate(resolve))};
 await reply(40);
 for(const [kind,energy,ready] of [['magic',59,false],['magic',60,true],['support',40,true],['defense',40,true],['attack',40,true]]){
  nodes.get('commander').value=kind;nodes.get('commander').onchange();
  const cost=kind==='magic'?60:40;
  assert.equal(nodes.get('normal').textContent,(english?'Normal ability · ':'Normal yetenek · ')+cost);
  assert.equal(nodes.get('normal').disabled,true,'pending load cannot cast from stale resources');
  await reply(energy);assert.equal(nodes.get('normal').disabled,!ready);
  if(!ready){const count=requests.length;await nodes.get('normal').onclick();assert.equal(requests.length,count,'59 cannot submit a mage normal');}
 }
});
