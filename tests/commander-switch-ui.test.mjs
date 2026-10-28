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
function harness({gold=1000,language='tr',confirmed=true,post}={}){
 const elements=new Map(),calls=[],prompts=[];
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const context=vm.createContext({$,COMMANDER_CHANGE_COST,walletGold:gold,
  document:{documentElement:{lang:language},createElement:element},
  window:{confirm:message=>{prompts.push(message);return confirmed}},
  uiText:text=>language==='en'?translate(text):text,
  post:async(url,body)=>{calls.push({url,body:JSON.parse(JSON.stringify(body))});return post?post(url,body):{profile:{commanderId:body.commanderId,levels:{...levels}},gold:gold-1000,cost:1000}},
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

test('shared switch cost is 1000 and static onboarding / fallback labels match in both languages',()=>{
 assert.equal(COMMANDER_CHANGE_COST,1000);
 assert.match(crazyGamesSource(app,'.js'),/from '\/crazygames\/commander-economy\.js'/);
 assert.match(app,/import\s*\{\s*COMMANDER_CHANGE_COST\s*\}\s*from\s*['"]\/commander-economy\.js['"]/);
 const html=read('public/index.html');
 const onboarding=html.slice(html.indexOf('<section id="commander-onboarding"'),html.indexOf('<section id="commander-profile"'));
 assert.match(onboarding,/Daha sonra 1000 altın karşılığında komutanını değiştirebilirsin\./);
 const open=html.match(/<button[^>]+id="commander-change-open"[\s\S]*?<\/button>/)[0];
 const confirm=html.match(/<button[^>]+id="commander-change-confirm"[\s\S]*?<\/button>/)[0];
 assert.match(open,/1000 ALTIN/);assert.match(confirm,/1000 · KOMUTAN DEĞİŞTİR/);
 assert.equal(translate('İlk girişinde bir komutan seç. Seçim hesabına kaydedilir. Daha sonra 1000 altın karşılığında komutanını değiştirebilirsin.'),'Choose a commander for your account. You can change commanders later for 1000 gold.');
 assert.equal(translate('1000 ALTIN'),'1000 GOLD');
 assert.equal(translate('🪙 1000 · KOMUTAN DEĞİŞTİR'),'🪙 1000 · CHANGE COMMANDER');
 assert.doesNotMatch(onboarding+open+confirm+switching,/5[.,]?000/);
});

test('1000 gold enables a selected new commander, 999 blocks both button and request',async()=>{
 const exact=harness();exact.choose(1);
 assert.equal(exact.$('commander-change-confirm').disabled,false);
 assert.match(exact.$('commander-change-confirm').textContent,/1000/);
 await exact.change();assert.equal(exact.calls.length,1);assert.equal(exact.context.walletGold,0);
 const short=harness({gold:999});short.choose(1);
 assert.equal(short.$('commander-change-confirm').disabled,true);
 await short.change();assert.equal(short.calls.length,0);assert.equal(short.prompts.length,0);assert.equal(short.context.walletGold,999);
});

test('the current commander and empty selection cannot start a paid request',async()=>{
 const h=harness({gold:5000});
 assert.equal(h.$('commander-change-confirm').disabled,true);await h.change();
 h.choose(0);assert.equal(h.$('commander-change-confirm').disabled,true);await h.change();
 assert.equal(h.calls.length,0);assert.equal(h.prompts.length,0);assert.equal(h.context.walletGold,5000);
});

for(const language of ['tr','en'])test(`${language} confirmation quotes 1000 and cancel spends nothing`,async()=>{
 const h=harness({language,confirmed:false});h.choose(1);await h.change();
 assert.equal(h.prompts.length,1);
 assert.match(h.prompts[0],language==='en'?/Spend 1000 gold to switch to Defense Commander\?/:/Savunma Komutanı komutanına geçmek için 1000 altın/);
 assert.doesNotMatch(h.prompts[0],/5[.,]?000/);
 assert.equal(h.calls.length,0);assert.equal(h.context.walletGold,1000);
 assert.equal(h.state().commanderProfile.commanderId,'attack');assert.equal(h.state().commanderBusy,false);
 assert.equal(h.$('commander-change-confirm').disabled,false);
});

test('repeated clicks during a request send one debit and success updates the profile and wallet',async()=>{
 let complete;
 const pending=new Promise(resolve=>{complete=resolve});
 const h=harness({gold:3500,post:()=>pending});h.choose(2);
 const first=h.change();
 assert.equal(h.state().commanderBusy,true);assert.equal(h.$('commander-change-confirm').disabled,true);
 assert.ok(h.$('commander-roster-options').children.every(button=>button.disabled));
 await h.change();assert.equal(h.calls.length,1);assert.equal(h.prompts.length,1);
 complete({profile:{commanderId:'magic',levels:{...levels}},gold:2500,cost:1000});await first;
 assert.deepEqual(h.calls,[{url:'/api/commander/change',body:{commanderId:'magic'}}]);
 assert.equal(h.context.walletGold,2500);assert.deepEqual(h.state().commanderProfile,{commanderId:'magic',levels});
 assert.equal(h.state().commanderBusy,false);assert.equal(h.state().commanderChangePending,null);
 assert.equal(h.$('commander-change-panel').hidden,true);assert.equal(h.$('commander-change-open').attributes['aria-expanded'],'false');
 assert.equal(h.$('commander-upgrade-message').textContent,'✓ Komutan değiştirildi. 1000 altın harcandı.');
 assert.equal(translate(h.$('commander-upgrade-message').textContent),'✓ Commander changed. 1000 gold spent.');
 await h.change();assert.equal(h.calls.length,1,'completed request clears selection and cannot be resubmitted');
});

test('success reports the server cost, including the existing free preview response',async()=>{
 const h=harness({post:async()=>({profile:{commanderId:'defense',levels},gold:1000,cost:0})});h.choose(1);await h.change();
 assert.equal(h.context.walletGold,1000);
 assert.equal(h.$('commander-upgrade-message').textContent,'✓ Komutan değiştirildi. 0 altın harcandı.');
 assert.equal(translate(h.$('commander-upgrade-message').textContent),'✓ Commander changed. 0 gold spent.');
});

test('missing cost in a compatible response falls back to 1000',async()=>{
 const h=harness({post:async()=>({profile:{commanderId:'defense',levels},gold:0})});h.choose(1);await h.change();
 assert.equal(h.$('commander-upgrade-message').textContent,'✓ Komutan değiştirildi. 1000 altın harcandı.');
});

test('server failure preserves profile and wallet, releases busy state and allows retry',async()=>{
 const h=harness({post:async()=>{throw Error('Komutan değiştirmek için 1000 altın gerekiyor.')}});h.choose(1);await h.change();
 assert.equal(h.context.walletGold,1000);assert.equal(h.state().commanderProfile.commanderId,'attack');
 assert.equal(h.state().commanderBusy,false);assert.equal(h.$('commander-change-confirm').disabled,false);
 assert.equal(h.$('commander-upgrade-message').textContent,'⚠ Komutan değiştirmek için 1000 altın gerekiyor.');
 assert.equal(translate(h.$('commander-upgrade-message').textContent),'⚠ Changing commanders requires 1000 gold.');
});

test('closing and reopening the roster clears pending selection without sending a change',async()=>{
 const h=harness();h.choose(1);assert.equal(h.$('commander-change-confirm').disabled,false);
 h.$('commander-change-close').onclick();
 assert.equal(h.$('commander-change-panel').hidden,true);assert.equal(h.state().commanderChangePending,null);
 h.$('commander-change-open').onclick();
 assert.equal(h.$('commander-change-panel').hidden,false);assert.equal(h.$('commander-change-confirm').disabled,true);
 assert.match(h.$('commander-change-confirm').textContent,/1000 · KOMUTAN DEĞİŞTİR/);
 await h.change();assert.equal(h.calls.length,0);
});
