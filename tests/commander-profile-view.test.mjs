import {commanderGoldUpgradeCost} from '../public/commander-economy.js';
import {commanderProgression,createDiamondPolicy} from '../paid-diamonds.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {commanderBranchView,commanderDiamondPolicyCopy,renderCommanderDevelopment,renderCommanderSkills,COMMANDER_BRANCHES} from '../public/commander-profile-view.js';
import {commanderAbilityStats,getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {commanderUltimateName,commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {createCommanderProfile,commanderStatBonus,previewCommanderUpgrade} from '../arena-commanders.js';
import {crazyGamesSource} from '../crazygames-build.js';
import {translate} from '../public/crazygames-en.js';

export class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.className='';this.text='';this.disabled=false;this.ownerDocument=document;}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;this.text='';}
 setAttribute(key,value){this.attributes[key]=String(value);}
}
const document={createElement:tag=>new Element(tag)};
const walk=node=>[node,...node.children.flatMap(walk)];
const find=(root,className)=>walk(root).filter(node=>node.className.split(' ').includes(className));
const profile=(id,level=0)=>({...createCommanderProfile(id),levels:{attack:level,defense:level,magic:level,support:level}});
const render=(p,options={})=>{const root=new Element();renderCommanderDevelopment(root,p,{document,gold:1_000_000,...options});return root;};

for(const id of ['attack','defense','magic','support'])for(const level of [0,1,19,20,39,40])test(`${id} level ${level}: previews match server progression and never mutate the profile`,()=>{
 const p=profile(id,level),before=structuredClone(p);
 for(const branch of COMMANDER_BRANCHES){
  const view=commanderBranchView(p,branch.id,{gold:1_000_000});
  assert.equal(view.bonus,100*commanderStatBonus(p,branch.id));
  assert.ok(view.progress>=0&&view.progress<=100);assert.ok(view.nodes.length<=5);
  assert.equal(view.nodes.filter(node=>node.state==='current').length,1);
  if(view.maxed){assert.equal(view.canUpgrade,false);assert.equal(view.cost,null);assert.equal(view.nextLevel,null);assert.equal(view.nodes.some(node=>node.state==='next'),false);}
  else{
   const upgraded=previewCommanderUpgrade(p,branch.id,1_000_000);
   assert.equal(view.cost,upgraded.cost);assert.equal(view.nextBonus,100*commanderStatBonus(upgraded.profile,branch.id));
   assert.deepEqual(view.nextStats,commanderAbilityStats(upgraded.profile));assert.equal(view.nodes.find(node=>node.state==='next').level,level+1);
  }
 }
 assert.deepEqual(p,before);
});

test('switched level40 is visibly retained, only20 active; no truncation, excess progress or repurchase',()=>{
 const p=profile('magic');p.levels.attack=40;
 const root=render(p,{selected:'attack'}),view=commanderBranchView(p,'attack',{gold:1_000_000});
 assert.equal(view.level,40);assert.equal(view.effectiveLevel,20);assert.equal(view.retainedLevel,20);assert.equal(view.bonus,10);
 assert.match(root.textContent,/40 seviye kayıtlı: 20 etkin \+ 20 saklı/);
 assert.equal(find(root,'cp-upgrade-button')[0].disabled,true);
 assert.equal(find(root,'cp-progress')[0].attributes['aria-valuenow'],'20');
 assert.equal(find(root,'cp-progress')[0].children[0].style.width,'100%');assert.equal(p.levels.attack,40);
 assert.equal(commanderBranchView({...p,commanderId:'attack'},'attack').effectiveLevel,40);
});

test('bounded connected path always includes exact next level and never pretends milestone unlock abilities',()=>{
 for(let level=0;level<=40;level++){
  const root=render(profile('attack',level));
  assert.equal(find(root,'cp-branch').length,4);assert.equal(find(root,'cp-branch-detail').length,1);assert.equal(find(root,'cp-upgrade-button').length,1);
  assert.ok(find(root,'cp-level-node').length<=5);assert.equal(walk(root).filter(node=>node.tagName==='img').length,4);assert.ok(walk(root).filter(node=>node.tagName==='img').every(node=>/^\/images\/commander-branch-(attack|defense|magic|support)\.svg$/.test(node.src)));
  assert.doesNotMatch(root.textContent,/kilit aç|yetenek aç|unlock/i);
 }
});

test('radial branches render separately around the single static commander; one compact upgrade panel remains below',()=>{
 const root=new Element(),branchesRoot=new Element();renderCommanderDevelopment(root,profile('magic',9),{document,branchesRoot,gold:10000});
 assert.equal(find(root,'cp-branch').length,0);assert.equal(find(branchesRoot,'cp-branch').length,4);assert.equal(find(root,'cp-branch-detail').length,1);
 assert.equal(find(root,'cp-detail-help').length,1);assert.equal(find(root,'cp-detail-help')[0].attributes.open,undefined);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const section=html.slice(html.indexOf('<section id="commander-profile"'),html.indexOf('<section id="home"'));
 assert.equal((section.match(/id="commander-active-portrait"/g)||[]).length,1);assert.match(section,/class="cp-command-tree"/);assert.match(section,/id="commander-branch-nodes"/);assert.doesNotMatch(section,/cp-layout|cp-identity|cp-development/);
 assert.ok(section.indexOf('id="commander-command-tree"')<section.indexOf('id="commander-upgrades"'));
});

test('small branch jewels represent actual10-level main or5-level side milestones, including retained progress',()=>{
 const p=profile('magic',9);p.levels.attack=40;const root=render(p);
 const main=find(root,'cp-branch').find(node=>node.dataset.branch==='magic'),side=find(root,'cp-branch').find(node=>node.dataset.branch==='attack');
 assert.deepEqual(find(main,'cp-node-milestones')[0].children.map(node=>Number(node.dataset.level)),[10,20,30,40]);
 assert.deepEqual(find(side,'cp-node-milestones')[0].children.map(node=>Number(node.dataset.level)),[5,10,15,20]);
 assert.ok(find(side,'cp-node-milestones')[0].children.every(node=>node.className==='earned'));
 assert.match(side.textContent,/20 \/ 20.*20 saklı/);
});

test('branch selection only previews; explicit next-level action is the only purchase callback',()=>{
 const selected=[],purchases=[],root=render(profile('attack'),{onSelect:id=>selected.push(id),onUpgrade:id=>purchases.push(id)});
 find(root,'cp-branch')[2].onclick();assert.deepEqual(selected,['magic']);assert.deepEqual(purchases,[]);
 assert.equal(find(root,'cp-branch')[0].attributes['aria-pressed'],'true');
 find(root,'cp-upgrade-button')[0].onclick();assert.deepEqual(purchases,['attack']);
});

test('disabled, exact-funds and busy states guard callbacks as well as buttons',()=>{
 for(const options of [{gold:199},{gold:200,busy:true}]){
  const calls=[],root=render(profile('attack'),{...options,onUpgrade:id=>calls.push(id)}),button=find(root,'cp-upgrade-button')[0];
  assert.equal(button.disabled,true);button.onclick();assert.deepEqual(calls,[]);
 }
 const root=render(profile('attack'),{gold:200});assert.equal(find(root,'cp-upgrade-button')[0].disabled,false);
 assert.match(render(profile('attack'),{gold:199}).textContent,/1 altın daha gerekiyor/);
});

test('active magic9→10 shows fixed one-attack stun and each pool16→17; side branch does not imply ability growth',()=>{
 const root=render(profile('magic',9),{selected:'magic',english:true});
 assert.match(root.textContent,/Stun · fixed effect 1 attack skipped → 1 attack skipped/);assert.doesNotMatch(root.textContent,/38.15%|38.5%/);assert.match(root.textContent,/Each pool \/ round \+16 → \+17/);assert.match(root.textContent,/1,032 GOLD/);
 assert.match(root.textContent,/do not scale with level/);
 assert.doesNotMatch(render(profile('magic',9),{selected:'attack',english:true}).textContent,/Normal ability effect|Each pool/);
});

for(const id of ['attack','defense','magic','support'])test(`${id} skill cards use current shared ultimate, real separate-pool cost and truthful scaling`,()=>{
 for(const english of [false,true]){
  const root=new Element();renderCommanderSkills(root,profile(id,20),{document,english});
  assert.equal(root.children.length,2);
  const ultimate=root.children[1];assert.match(ultimate.textContent,new RegExp(String(getCommanderAbilityCost(id,'ultimate'))));
  assert.ok(ultimate.textContent.includes(commanderUltimateName(id,{english})));assert.ok(ultimate.textContent.includes(commanderUltimateDescription(id,{english})));
  assert.equal(find(ultimate,'cp-skill-main')[0].children.some(node=>node.tagName==='strong'),id==='defense');
  assert.doesNotMatch(root.textContent,/Yıkıcı Hücum|Sarsılmaz Savunma|Kitle Zayıflatma|Büyük İyileştirme/);
 }
});

test('quotes control premium costs; unknown price/balance fails closed and disabled feature stays legacy',()=>{
 const p=profile('attack',20);
 const progression={diamondsEnabled:true,purchaseAvailable:false,branches:{attack:{currentLevel:20,nextLevel:21,cap:40,gold:7668,diamonds:10,requiresDiamonds:true,canUpgrade:true,reason:null}}};
 let root=render(p,{gold:7668,diamonds:10,progression});assert.equal(find(root,'cp-upgrade-button')[0].disabled,false);assert.match(root.textContent,/7.668 ALTIN \+ 10 ELMAS/);assert.match(root.textContent,/satın alma henüz açık değil/);
 for(const diamonds of [9,null])assert.equal(commanderBranchView(p,'attack',{gold:7668,diamonds,progression}).reason,'insufficient_diamonds');
 const noPrice=structuredClone(progression);noPrice.branches.attack.diamonds=null;noPrice.branches.attack.canUpgrade=false;noPrice.branches.attack.reason='pricing_unavailable';
 root=render(p,{gold:7668,diamonds:100,progression:noPrice});assert.equal(find(root,'cp-upgrade-button')[0].disabled,true);assert.match(root.textContent,/ELMAS FİYATI HENÜZ BELİRLENMEDİ/);assert.doesNotMatch(root.textContent,/null/);
 assert.equal(commanderBranchView(p,'attack',{gold:7668,progression:{diamondsEnabled:true,branches:{}}}).reason,'pricing_unavailable');
 assert.equal(commanderBranchView(p,'attack',{gold:7668,progression:null}).canUpgrade,true);
});

test('welcome copy requires authoritative enabled bonus policy and never claims the current user received it',()=>{
 assert.equal(commanderDiamondPolicyCopy(null),'');
 assert.equal(commanderDiamondPolicyCopy({diamondsEnabled:false,welcomeBonus:{enabled:true,amount:10,eligibleProviders:['google']}}),'');
 const off=commanderDiamondPolicyCopy({diamondsEnabled:true,welcomeBonus:{enabled:false,amount:10}},{english:true});assert.doesNotMatch(off,/10|welcome|receive/);
 const on=commanderDiamondPolicyCopy({diamondsEnabled:true,welcomeBonus:{enabled:true,amount:10,eligibleProviders:['google']}},{english:true});assert.match(on,/New verified Google members receive 10 diamonds once/);assert.doesNotMatch(on,/You received|claimed|earned/);assert.match(on,/not available yet/);assert.doesNotMatch(on,/CrazyGames/);
 const mismatched=commanderDiamondPolicyCopy({diamondsEnabled:true,welcomeBonus:{enabled:true,amount:10,eligibleProviders:['crazygames']}},{english:true});assert.doesNotMatch(mismatched,/receive 10/);
});

test('integrated server quotes and shared exponential fallback agree at every main-branch level in both flag states',()=>{
 for(const enabled of [false,true])for(let level=0;level<=40;level++){
  const p=profile('attack',level),wallet={gold:1_000_000,diamonds:10000};
  const progression=commanderProgression(p,wallet,createDiamondPolicy({HERO_DIAMONDS_ENABLED:enabled?'1':'0'}));
  const view=commanderBranchView(p,'attack',{...wallet,progression});
  assert.equal(view.cost,level===40?null:commanderGoldUpgradeCost(level));
  assert.equal(view.canUpgrade,level<40);assert.equal(view.diamondCost,progression.branches.attack.diamonds);
  assert.equal(commanderBranchView(p,'attack',{gold:wallet.gold}).cost,view.cost);
 }
});

test('fresh authoritative balances refresh stale affordability without overriding nonfinancial quote restrictions',()=>{
 const p=profile('attack',1),progression={diamondsEnabled:false,branches:{attack:{currentLevel:1,nextLevel:2,cap:40,gold:400,diamonds:0,requiresDiamonds:false,canUpgrade:false,reason:'insufficient_gold'}}};
 assert.equal(commanderBranchView(p,'attack',{gold:5000,progression}).canUpgrade,true);
 const funded=render(p,{gold:5000,progression,english:true});assert.equal(find(funded,'cp-upgrade-button')[0].disabled,false);assert.doesNotMatch(funded.textContent,/more gold needed/);
 progression.branches.attack.canUpgrade=true;progression.branches.attack.reason=null;
 assert.equal(commanderBranchView(p,'attack',{gold:399,progression}).reason,'insufficient_gold');
 progression.branches.attack.canUpgrade=false;progression.branches.attack.reason='pricing_unavailable';
 assert.equal(commanderBranchView(p,'attack',{gold:5000,progression}).canUpgrade,false);
});

test('mobile accessibility constraints and English module routing are explicit',()=>{
 const css=readFileSync(new URL('../public/commander-profile.css',import.meta.url),'utf8');
 assert.match(css,/button\{min-height:44px\}/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/cp-topbar\{[^}]*flex-wrap:wrap/);assert.match(css,/cp-wallet\{[^}]*flex-wrap:wrap/);assert.match(css,/cp-branch\[data-type=attack\]\{top:8%;left:50%/);assert.match(css,/cp-branch\[data-type=defense\]\{top:47%;left:84%/);assert.doesNotMatch(css,/overflow-x:\s*(auto|scroll)/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');assert.match(crazyGamesSource(app,'.js'),/from '\/crazygames\/commander-profile-view.js'/);
 const root=render(profile('magic',9),{english:true});assert.doesNotMatch(root.textContent,/[ğışİçüö]|ALTIN|SEVİYE|SIRADAKİ/);
 assert.equal(translate('Bir dal seç. Sonraki seviyenin gerçek etkisini gör.'),'Choose a branch. See exactly what the next level changes.');
});

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const upgradeSource=app.slice(app.indexOf('async function upgradeCommander(stat){'),app.indexOf("$('commander-select-confirm').onclick"));
function upgradeHarness(post){
 const calls=[],elements=new Map();let sequence=0;
 const context={commanderProfile:profile('attack'),commanderBusy:false,commanderProgression:null,commanderDiamonds:null,commanderUpgradeRequest:null,walletGold:1000,login:{authToken:'first'},document:{documentElement:{lang:'en'}},crypto:{randomUUID:()=>`test-request-${++sequence}`},commanderBranchView,signedIn:()=>!!context.login?.authToken,renderCommanderProfile(){},showGold(value){context.walletGold=value;},$:id=>{if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id)},post:async(url,body)=>{calls.push({url,body:structuredClone(body)});return post(url,body,calls.length);}};
 vm.createContext(context);vm.runInContext(upgradeSource,context);return {context,calls,run:stat=>context.upgradeCommander(stat)};
}

test('upgrade locks repeated clicks and applies only authoritative returned profile/balance',async()=>{
 let finish;const h=upgradeHarness(()=>new Promise(resolve=>finish=resolve));const first=h.run('attack');await h.run('attack');assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].body.expectedCurrentLevel,0);assert.equal(h.calls[0].body.commanderId,'attack');
 finish({profile:{...profile('attack'),levels:{attack:1,defense:0,magic:0,support:0}},gold:800});await first;
 assert.equal(h.context.commanderProfile.levels.attack,1);assert.equal(h.context.walletGold,800);assert.equal(h.context.commanderBusy,false);
});

test('transport-uncertain retry retains requestId and expected level when reconciliation also fails',async()=>{
 const h=upgradeHarness(()=>{throw Error('Network unavailable');});await h.run('attack');await h.run('attack');
 const upgrades=h.calls.filter(call=>call.url.endsWith('/upgrade'));assert.equal(upgrades.length,2);assert.equal(upgrades[0].body.requestId,upgrades[1].body.requestId);assert.equal(h.context.walletGold,1000);assert.equal(h.context.commanderProfile.levels.attack,0);
});

test('server-uncertain5xx retains request ID; explicit conflict clears it before retry',async()=>{
 for(const status of [503,409]){
  const h=upgradeHarness(url=>{if(url.endsWith('/upgrade'))throw Object.assign(Error('Unavailable'),{status});throw Error('Reconciliation unavailable');});
  await h.run('attack');await h.run('attack');const requests=h.calls.filter(call=>call.url.endsWith('/upgrade'));
  assert.equal(requests[0].body.requestId===requests[1].body.requestId,status===503);
 }
});

test('lost successful response reconciles saved level and does not reapply that purchase',async()=>{
 const h=upgradeHarness(url=>{if(url.endsWith('/upgrade'))throw Error('Response lost');return {profile:{...profile('attack'),levels:{attack:1,defense:0,magic:0,support:0}},gold:800};});await h.run('attack');
 assert.equal(h.context.commanderProfile.levels.attack,1);assert.equal(h.context.walletGold,800);assert.equal(h.context.commanderUpgradeRequest,null);
});

test('logout or account replacement ignores pending purchase result and leaves new wallet untouched',async()=>{
 let finish;const h=upgradeHarness(()=>new Promise(resolve=>finish=resolve));const pending=h.run('attack');h.context.login={authToken:'second'};h.context.commanderProfile=profile('support');h.context.walletGold=500;
 finish({profile:profile('attack',1),gold:800});await pending;assert.equal(h.context.commanderProfile.commanderId,'support');assert.equal(h.context.walletGold,500);
});

test('maxed, unaffordable and logged-out actions never send a purchase',async()=>{
 for(const mutate of [context=>context.walletGold=199,context=>context.commanderProfile=profile('attack',40),context=>context.login=null]){const h=upgradeHarness(()=>{throw Error('Unexpected request');});mutate(h.context);await h.run('attack');assert.equal(h.calls.length,0);}
});

for(const english of [false,true])test(`Hunt Order profile separates until-death focus from the one-attack bonus (${english?'EN':'TR'})`,()=>{
 const root=new Element();renderCommanderSkills(root,profile('attack',20),{document,english});
 const summary=root.children[1].children.find(child=>child.tagName==='p');
 assert.match(summary.textContent,english?/until the target dies/:/Hedef ölünceye kadar/);
 assert.match(summary.textContent,english?/Every ally alive when cast gains \+20% attack for its next attack only/:/Kullanım anında yaşayan her müttefike sonraki tek saldırısı için \+%20 saldırı/);
 assert.match(root.children[1].textContent,english?/no round or attack-count limit/:/tur veya saldırı sayısı sınırı yoktur/);
 assert.doesNotMatch(root.children[1].textContent,/next round|Sonraki tur/);
});
