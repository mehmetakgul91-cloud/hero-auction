import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {translate} from '../public/crazygames-en.js';
import {crazyGamesSource} from '../crazygames-build.js';
import {COMMANDER_CHANGE_COST} from '../public/commander-economy.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('public/app.js');
const declarations=app.slice(app.indexOf('const commanderOptions='),app.indexOf('function commanderVisibility()'));
const switching=app.slice(app.indexOf('function renderCommanderRoster()'),app.indexOf('function renderCommanderProfile()'));
const levels={attack:17,defense:4,magic:2,support:8};
function element(){
 return {children:[],attributes:{},hidden:false,disabled:false,textContent:'',
  append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},
  setAttribute(key,value){this.attributes[key]=value}};
}
function harness({gold=100,language='tr',confirmed=true,post}={}){
 const elements=new Map(),calls=[],prompts=[];
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const context=vm.createContext({$,COMMANDER_CHANGE_COST,walletGold:gold,login:{authToken:"test"},
  document:{documentElement:{lang:language},createElement:element},
  window:{confirm:message=>{prompts.push(message);return confirmed}},
  uiText:text=>language==='en'?translate(text):text,
  post:async(url,body)=>{calls.push({url,body:JSON.parse(JSON.stringify(body))});return post?post(url,body):{profile:{commanderId:body.commanderId,levels:{...levels}},gold,cost:0}},
  showGold:value=>{context.walletGold=value},
  renderCommanderProfile(){context.renderCommanderRoster()},
 });
 vm.runInContext(declarations+switching,context);
 vm.runInContext('commanderProfile='+JSON.stringify({commanderId:'attack',levels})+';commanderChangeOpen=true;renderCommanderRoster()',context);
 return {$,calls,prompts,context,
  choose:index=>$('commander-roster-options').children[index].onclick(),
  change:()=>context.changeCommander(),
  state:()=>JSON.parse(vm.runInContext('JSON.stringify({commanderProfile,commanderChangePending,commanderChangeOpen,commanderBusy})',context))};
}

test('commander choice is free and optional in both languages',()=>{
 assert.equal(COMMANDER_CHANGE_COST,0);
 const html=read('public/index.html');
 assert.match(html,/id="commander-onboarding-close"/);
 assert.doesNotMatch(html,/<small>100 ALTIN|100 · KOMUTAN DEĞİŞTİR|Daha sonra 100 altın/);
 assert.equal(translate('✓ Komutan ücretsiz değiştirildi.'),'✓ Commander changed for free.');
 assert.match(app,/profileReady:commanderLoaded,/);
 assert.match(app,/ready:signedIn\(\)&&!commanderProfileOpen&&!room/);
});
for(const language of ['tr','en'])test(language+' switches with zero gold and no spend prompt',async()=>{
 const h=harness({gold:0,language,confirmed:false});h.choose(1);
 assert.equal(h.$('commander-change-confirm').disabled,false);
 await h.change();assert.equal(h.calls.length,1);assert.equal(h.prompts.length,0);
 assert.equal(h.context.walletGold,0);assert.equal(h.state().commanderProfile.commanderId,'defense');
 assert.deepEqual(h.state().commanderProfile.levels,levels);
});
test('current commander and empty selection do not submit',async()=>{
 const h=harness();await h.change();h.choose(0);await h.change();assert.equal(h.calls.length,0);
});
test('repeated clicks send one request and success clears selection',async()=>{
 let complete;const h=harness({post:()=>new Promise(resolve=>complete=resolve)});h.choose(2);
 const first=h.change();await h.change();assert.equal(h.calls.length,1);
 assert.ok(h.$('commander-roster-options').children.every(b=>b.disabled));
 complete({profile:{commanderId:'magic',levels},gold:100,cost:0});await first;
 assert.equal(h.state().commanderChangePending,null);assert.equal(h.$('commander-change-panel').hidden,true);
 await h.change();assert.equal(h.calls.length,1);
});
test('failed request preserves profile and wallet and can retry',async()=>{
 const h=harness({post:async()=>{throw Error('Unavailable')}});h.choose(1);await h.change();
 assert.equal(h.context.walletGold,100);assert.equal(h.state().commanderProfile.commanderId,'attack');
 assert.equal(h.state().commanderBusy,false);assert.equal(h.$('commander-change-confirm').disabled,false);
});
test('closing and reopening clears pending choice',async()=>{
 const h=harness();h.choose(1);h.$('commander-change-close').onclick();h.$('commander-change-open').onclick();
 assert.equal(h.state().commanderChangePending,null);assert.equal(h.$('commander-change-confirm').disabled,true);
 await h.change();assert.equal(h.calls.length,0);
});
test('late change response cannot replace another account profile',async()=>{
 let complete;const h=harness({post:()=>new Promise(resolve=>complete=resolve)});h.choose(2);const first=h.change();
 h.context.login={authToken:'other'};complete({profile:{commanderId:'magic',levels},gold:0});await first;
 assert.equal(h.state().commanderProfile.commanderId,'attack');assert.equal(h.context.walletGold,100);
});
