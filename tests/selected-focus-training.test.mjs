import {commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {describeBattleEvent} from '../public/battle-event-text.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
import {getCommanderAbilityCost} from '../public/commander-ability-rules.js';import {trainingCommanderResources,trainingCommanderEnemyTargets} from '../public/commander-training-resources.js';
test('training targets use only authoritative living enemy snapshots, never approximate HP',()=>{
 const result={teams:[[{id:'ally',name:'Ally'}],[{id:'high',name:'High'},{id:'low',name:'Low'},{id:'dead',name:'Dead'}]],commanderResourcesByRound:[{round:4,targets:[[{id:'ally',hp:100}],[{id:'high',hp:90},{id:'low',hp:1},{id:'dead',hp:0},{id:'forged',hp:100}]]}]};
 assert.deepEqual(trainingCommanderEnemyTargets(result,4),[{id:'high',name:'High'},{id:'low',name:'Low'}]);assert.deepEqual(trainingCommanderEnemyTargets(result,5),[]);assert.deepEqual(trainingCommanderEnemyTargets(null,1),[]);
});
test('training Av Emri requires explicit dropdown choice, cancels without fee, clears dead selection and sends chosen ID',async()=>{
 const source=readFileSync(new URL('../public/commander-training.html',import.meta.url),'utf8').split('<script type="module">')[1].split('</script>')[0].replace(/^import .*;\n/gm,'');
 class Node{style={};value='attack';disabled=false;textContent='';hidden=false;replaceChildren(){}append(){}}
 const nodes=new Map(),requests=[],document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)},createElement:()=>new Node()};
 runInNewContext(source,{document,getCommanderAbilityCost,trainingCommanderResources,trainingCommanderEnemyTargets,commanderUltimateDescription,describeBattleEvent,fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 const data=()=>({rounds:15,teams:[[],[{id:'high',name:'High',maxHp:100},{id:'low',name:'Low',maxHp:100}]],log:[],commanderResourcesByRound:Array.from({length:15},(_,i)=>({round:i+1,energy:[100,100],ultimateEnergy:[100,100],ultimateUsed:[false,false],targets:[[],[{id:'high',hp:i<5?90:0},{id:'low',hp:1}]]}))});
 const reply=async(index,value,ok=true)=>{requests[index].resolve({ok,json:async()=>value});await new Promise(r=>setImmediate(r))};await reply(0,data());
 assert.equal(nodes.get('ultimate').disabled,true);assert.equal(nodes.get('focus-target').value,'');assert.equal(nodes.get('focus-target-field').hidden,false);
 nodes.get('focus-target').value='high';nodes.get('focus-target').onchange();assert.equal(nodes.get('ultimate').disabled,false);nodes.get('focus-cancel').onclick();assert.equal(nodes.get('focus-target').value,'');assert.equal(nodes.get('ultimate').disabled,true);assert.equal(requests.length,1);assert.equal(nodes.get('ultimate-energy-label').textContent,'Ulti dolumu: 100 / 100');
 nodes.get('focus-target').value='high';nodes.get('focus-target').onchange();const first=nodes.get('ultimate').onclick();assert.deepEqual(JSON.parse(requests[1].options.body).actions,[{round:1,ability:'ultimate',targetIds:['high']}]);await reply(1,{error:'target no longer alive'},false);await first;assert.equal(nodes.get('focus-target').value,'');assert.equal(nodes.get('ultimate').disabled,true);
 nodes.get('focus-target').value='high';nodes.get('focus-target').onchange();for(let i=0;i<5;i++)nodes.get('advance').onclick();assert.equal(nodes.get('focus-target').value,'');assert.equal(nodes.get('ultimate').disabled,true);assert.equal(requests.length,2);
 nodes.get('focus-target').value='low';nodes.get('focus-target').onchange();const second=nodes.get('ultimate').onclick();assert.deepEqual(JSON.parse(requests[2].options.body).actions,[{round:6,ability:'ultimate',targetIds:['low']}]);const accepted=data();accepted.commanderResourcesByRound[5].ultimateUsed[0]=true;accepted.commanderResourcesByRound[5].ultimateEnergy[0]=25;await reply(2,accepted);await second;assert.equal(nodes.get('focus-target-field').hidden,true);assert.equal(nodes.get('ultimate-energy-label').textContent,'Ulti dolumu: Kullanıldı');
});

for(const english of [false,true])test(`training shares Hunt Order description, tooltip and committed replay duration (${english?'EN':'TR'})`,async()=>{
 const source=readFileSync(new URL('../public/commander-training.html',import.meta.url),'utf8').split('<script type="module">')[1].split('</script>')[0].replace(/^import .*;\n/gm,'');
 class Node{style={};value='attack';children=[];disabled=false;textContent='';hidden=false;replaceChildren(){this.children=[]}append(...children){this.children.push(...children)}}
 const nodes=new Map(),document={documentElement:{lang:english?'en':'tr'},getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)},createElement:()=>new Node()};
 const event={round:1,side:0,actor:'commander:0',action:'commander-attack-ultimate',value:1,focusUntilDeath:true};
 const data={rounds:15,teams:[[],[]],log:[event],commanderResourcesByRound:[{round:1,energy:[100,100],ultimateEnergy:[25,100],ultimateUsed:[true,false],targets:[[],[]]}]};
 runInNewContext(source,{document,getCommanderAbilityCost,trainingCommanderResources,trainingCommanderEnemyTargets,commanderUltimateDescription,describeBattleEvent,fetch:async()=>({ok:true,json:async()=>data})});
 await new Promise(r=>setImmediate(r));
 const expected=commanderUltimateDescription('attack',{english});
 assert.equal(nodes.get('ultimate-description').textContent,expected);assert.equal(nodes.get('ultimate').title,expected);
 assert.match(nodes.get('log').children[0].textContent,english?/Focus until the target dies/:/Hedef ölünceye kadar/);
 assert.doesNotMatch(nodes.get('log').children[0].textContent,/commander-attack-ultimate/);
});
