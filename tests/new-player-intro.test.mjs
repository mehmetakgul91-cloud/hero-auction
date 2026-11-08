import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIntroProgress,introCanShow,introLessons,createNewPlayerIntro,INTRO_KEY} from '../public/new-player-intro.js';
import {recordFirstBotMatch,readFirstBotMatch,isFirstBotMatch} from '../public/first-bot-match-guide.js';
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),map};}
test('only an explicitly absent profile enrolls; established players and other accounts remain untouched',()=>{
 const s=storage(),p=createIntroProgress({storage:s});
 p.observeProfile('existing',{commanderId:'attack'});p.observeProfile('unknown',undefined);p.observeProfile(null,null);
 assert.equal(p.read('existing'),null);assert.equal(p.read('unknown'),null);assert.equal(s.map.size,0);
 p.observeProfile('new',null);assert.equal(p.read('new'),'pending');p.observeProfile('new',{commanderId:'attack'});assert.equal(p.read('new'),'pending');
 p.complete('new');p.observeProfile('new',null);assert.equal(p.read('new'),'done');assert.equal(p.read('other'),null);
 assert.equal(createIntroProgress({storage:s}).read('new'),'done');
});
test('local interruption resumes enrolled account but storage absence does not reenroll existing profiles',()=>{
 const s=storage();createIntroProgress({storage:s}).observeProfile('a',null);const resumed=createIntroProgress({storage:s});resumed.observeProfile('a',{commanderId:'attack'});assert.equal(resumed.read('a'),'pending');
 const broken={getItem(){throw Error()},setItem(){throw Error()}};const p=createIntroProgress({storage:broken});p.observeProfile('a',null);assert.equal(p.read('a'),'pending');p.complete('a');assert.equal(p.read('a'),'done');
});
test('invite, restored room, loading profile and platform contexts cannot start an intro',()=>{
 const base={enabled:true,account:'a',profileReady:true,blocked:false,homeVisible:true,pending:true};assert.equal(introCanShow(base),true);
 for(const change of [{enabled:false},{account:null},{profileReady:false},{blocked:true},{homeVisible:false},{pending:false}])assert.equal(introCanShow({...base,...change}),false);
});
test('first match marker is bounded to a single account, easy bot and match key',()=>{
 const s=storage();for(const room of [{mode:'random',difficulty:'easy'},{mode:'bot',difficulty:'medium'},{mode:'bot',difficulty:'easy'}])recordFirstBotMatch(s,'a',room);
 assert.equal(s.map.size,0);
 recordFirstBotMatch(s,'a',{mode:'bot',difficulty:'easy',code:'123',matchKey:'1:456'});
 assert.equal(isFirstBotMatch(s,'a','123','1:456'),true);assert.equal(isFirstBotMatch(s,'b','123','1:456'),false);assert.equal(isFirstBotMatch(s,'a','123','2:456'),false);
 assert.deepEqual(readFirstBotMatch(s,'a'),{code:'123',matchKey:'1:456'});
});
class Element{
 constructor(doc){this.doc=doc;this.attrs={};this.hidden=false;this.isConnected=true;this.children=[];}
 setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}prepend(x){this.children.unshift(x);}append(...x){this.children.push(...x);}remove(){this.isConnected=false;}focus(){this.focused=true;}
 set innerHTML(html){for(const match of html.matchAll(/id="([^"]+)"/g))this.doc.nodes[match[1]]=new Element(this.doc);}
}
function fixture(onEvent){const doc={nodes:{},getElementById(id){return this.nodes[id];},createElement(){return new Element(this);}};doc.nodes.home=new Element(doc);
 let c={enabled:true,account:'a',token:'token-a',profileReady:true,blocked:false,homeVisible:true,english:false},calls=0,resolve;
 const s=storage(),intro=createNewPlayerIntro({document:doc,storage:s,getContext:()=>c,onEvent,start:()=>{calls++;return new Promise(r=>resolve=r);}});
 return {doc,s,intro,get c(){return c;},setContext(value){c={...c,...value};intro.sync();},calls:()=>calls,resolve:v=>resolve(v),button:part=>doc.nodes['new-player-intro-'+part]};
}
test('three lessons, skip leads to explicit start; double-click cannot duplicate entry and failed start is retryable',async()=>{
 const f=fixture();f.intro.observeProfile(null);assert.equal(f.button('progress').textContent,'İLK MAÇ · 1 / 3');
 f.button('skip').onclick();assert.equal(f.button('progress').textContent,'İLK MAÇ · 3 / 3');assert.equal(f.calls(),0);
 const running=f.button('next').onclick();f.button('next').onclick();assert.equal(f.calls(),1);assert.equal(f.button('next').disabled,true);
 f.resolve(false);await running;assert.equal(f.intro.pending(),true);assert.equal(f.button('next').disabled,false);
 const next=f.button('next').onclick();f.resolve(true);await next;assert.equal(f.intro.pending(),false);assert.equal(f.doc.nodes.home.attrs['data-first-bot-intro'],'done');
});
test('logout/account change ignores a stale successful start and never completes another account',async()=>{
 const f=fixture();f.intro.observeProfile(null);f.button('skip').onclick();const p=f.button('next').onclick();f.setContext({account:'b',token:'token-b'});f.intro.observeProfile(null);f.resolve(true);await p;
 assert.equal(f.s.getItem(INTRO_KEY+'a'),'pending');assert.equal(f.s.getItem(INTRO_KEY+'b'),'pending');assert.equal(f.button('progress').textContent,'İLK MAÇ · 1 / 3');
});
test('newly arriving room or invite blocks a start even if a stale button is clicked',async()=>{
 const f=fixture();f.intro.observeProfile(null);f.button('skip').onclick();f.setContext({blocked:true});await f.button('next').onclick();assert.equal(f.calls(),0);
});
test('integration preserves easy entry idempotency, old players, portal and reward rules',()=>{
 const app=readFileSync('public/app.js','utf8'),guide=readFileSync('public/first-match-guide.js','utf8'),html=readFileSync('public/index.html','utf8');
 assert.match(app,/start:\(\)=>enterBotGame\('\/api\/bot','easy'\)/);assert.match(app,/enabled:!window.HeroPlatform/);assert.match(app,/newPlayerIntro.observeProfile\(result.profile\)/);
 assert.match(app,/const consent=await botEntryConsent.request\(scope,difficulty\)/);assert.match(app,/restorePending=null;newPlayerIntro.sync\(\)/);assert.match(app,/canShow:\(\)=>!newPlayerIntro.pending\(\)/);
 assert.match(guide,/home.hasAttribute\('data-first-bot-intro'\)/);assert.match(html,/Türkiye saatiyle 02\.00’da/);assert.doesNotMatch(html,/Türkiye saatiyle 00\.00’da/);
 assert.match(guide,/getAttribute\('data-first-bot-intro'\)==='done'\)markSeen\(\)/);assert.equal(introLessons.tr.length,3);assert.equal(introLessons.en.length,3);assert.match(introLessons.tr[0][1],/Altın kesilmez/);
});

test('approved portrait design uses real assets, bilingual stage content and illustrative non-action controls',async()=>{
 const {introScene,introPortraits}=await import('../public/new-player-intro.js');
 for(const art of introPortraits)assert.ok(readFileSync('public/images/original/'+art).length>100);
 assert.ok(readFileSync('public/images/lobby-crest.svg').length>100);
 for(const en of [false,true])for(let step=0;step<3;step++){
  const html=introScene(step,en);assert.match(html,/images\/original\//);assert.doesNotMatch(html,/<button|onclick|fetch\(/);
 }
 assert.match(introScene(0),/Altın kesilmez/);assert.match(introScene(1),/20 KREDİ/);assert.match(introScene(2),/Hazırım/);
 assert.match(introScene(2,true),/Ready/);assert.match(introScene(2),/Örnek diziliş/);
 const css=readFileSync('public/new-player-intro.css','utf8');assert.match(css,/width:min\(620px,100%\)/);assert.match(css,/@media\(max-width:430px\)/);assert.match(css,/min-height:44px/);
});

test('analytics callback failure never blocks guide or explicit free match start',async()=>{
 const f=fixture(()=>{throw Error('offline analytics');});f.intro.observeProfile(null);f.button('skip').onclick();const run=f.button('next').onclick();assert.equal(f.calls(),1);f.resolve(true);await run;assert.equal(f.intro.pending(),false);
});
