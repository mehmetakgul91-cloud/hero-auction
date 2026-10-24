import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {translate} from '../public/crazygames-en.js';
import {buildDefaultFormation} from '../public/preparation-formation.js';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('battle-preview.html'),css=read('battle-preview.css'),source=read('battle-preview.js');
const formation=html.slice(html.indexOf('<section class="formation"'),html.indexOf('<div class="arena-commander-matchup"'));

test('preparation contains one board and Ready, no second hero list or manual slot instructions',()=>{
 for(const id of ['preparation-title','prep-clock','ready-a','ready-b','formation-placed-count','formation-current-power','front-slots','back-slots','apply-roles'])assert.ok(formation.includes(`id="${id}"`),id);
 assert.doesNotMatch(formation,/role-pickers|Yuvaya dokun|sürükle|yer değiştirir/);
 assert.doesNotMatch(source,/function placeHero|function attachDrag|function completeSlots|function renderRolePickers|draggable=true/);
 assert.match(formation,/Kahramanların uygun safa yerleşir/);
 assert.ok(formation.indexOf('class="battle-board"')<formation.indexOf('id="apply-roles"'));
 assert.ok(formation.indexOf('id="apply-roles"')<formation.indexOf('id="commander-bonus-detail"'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
 assert.doesNotMatch(formation,/<details[^>]*\bopen\b/);
 assert.match(formation,/Bu gösterge tahmini güç puanıdır; savaşın kesin sonucunu belirlemez/);
});

test('prep keeps touch targets, visible keyboard focus and a reachable Ready without combat layout changes',()=>{
 assert.match(css,/\.preparation-detail>summary\{min-height:44px/);
 assert.match(css,/\.formation \.battle-board \.lane-switch\{min-height:44px/);
 assert.match(css,/\.formation \.battle-board \.board-row\{flex-wrap:wrap\}/);
 assert.match(css,/\.preparation-ready-bar\{position:sticky;bottom:0/);
 assert.match(css,/\.lane-switch:focus-visible/);
 assert.match(css,/touch-action:pan-y/);
});

class Element {
 children=[];dataset={};style={};attributes={};textContent='';open=false;
 classList={toggle(){}};
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children}
 setAttribute(name,value){this.attributes[name]=value}
}
function harness({loaded=true}={}){
 const ids=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
 const saved=[];
 const context={document:{createElement:()=>new Element(),querySelector:()=>null},$:id=>ids[id],heroPortrait(){},creditBonus:()=>0,commanderBonusForRole:()=>0,savePreviewDraft(){saved.push('saved')},buildDefaultFormation};
 const code=source.slice(source.indexOf('function displayedLanePower('),source.indexOf('let prepTimer='));
 const laneCode=source.slice(source.indexOf('function roleAt('),source.indexOf('const heroArtCache='));
 runInNewContext(`const demoA=[['Hero A','tank',90],['Hero B','fighter',69],['Hero C','energy',80],['Hero D','fighter',83],['Hero E','support',90]];
 const assignedRoles=demoA.map(hero=>hero[1]),positions=[0,1,2,3,4],lanes=['front','front','back','back','front'];
 const roleNames={tank:'TANK',fighter:'FIGHTER',energy:'ENERGY',support:'SUPPORT'},roleIcons={};
 let prepDone=false,prepSubmitting=false,arenaMode=false,auctionLoaded=${loaded},selectedHero=null,auctionMode=true,auctionLaneModifiers=[],previewCredits=0,preparationDraft=null;
 ${laneCode}${code}
 this.actions={renderBoard,setLane,formationSnapshot,lock(){prepDone=true},load(){auctionLoaded=true},snapshot(){return [...positions]}};`,context);
 return {ids,saved,actions:context.actions};
}

test('all five heroes are on the board immediately; front/back edits never reorder, lose or duplicate them',()=>{
 const h=harness();h.actions.renderBoard();
 assert.equal(h.ids['formation-placed-count'].textContent,'5 / 5');
 assert.equal(h.ids['front-slots'].children.length,3);assert.equal(h.ids['back-slots'].children.length,2);
 h.ids['commander-bonus-detail'].open=true;h.ids['preparation-help'].open=true;
 h.ids['front-slots'].children[0].children[1].onclick();
 assert.deepEqual(Array.from(h.actions.snapshot()),[0,1,2,3,4],'portrait selection cannot swap exact slots');
 h.ids['front-slots'].children[0].children[3].onclick();
 assert.equal(h.ids['front-slots'].children.length,2);assert.equal(h.ids['back-slots'].children.length,3);
 h.actions.setLane(0,'front');h.actions.setLane(2,'front');h.actions.setLane(3,'front');
 assert.equal(h.ids['front-slots'].children.length,5);assert.equal(h.ids['back-slots'].children.length,0,'existing rules allow any split');
 assert.equal(h.ids['formation-placed-count'].textContent,'5 / 5');
 assert.deepEqual(Array.from(h.actions.snapshot()),[0,1,2,3,4]);
 assert.equal(h.ids['commander-bonus-detail'].open,true);assert.equal(h.ids['preparation-help'].open,true);
 h.actions.lock();h.actions.setLane(0,'back');assert.equal(h.actions.formationSnapshot().lanes[0],'front');
});

test('unverified auction data renders no fake or empty hero slots, and cannot be edited',()=>{
 const h=harness({loaded:false});h.actions.renderBoard();
 assert.equal(h.ids['front-slots'].children.length,0);assert.equal(h.ids['back-slots'].children.length,0);
 assert.equal(h.ids['formation-placed-count'].textContent,'0 / 5');
 h.actions.setLane(0,'back');assert.equal(h.actions.formationSnapshot().lanes[0],'front');
 h.actions.load();h.actions.renderBoard();assert.equal(h.ids['formation-placed-count'].textContent,'5 / 5');
});

test('new prep labels translate for CrazyGames without changing hero identity or data',()=>{
 assert.equal(translate('TAKIMDAKİ KAHRAMAN'),'HEROES IN TEAM');
 assert.equal(translate('Kahramanların uygun safa yerleşir. İstersen ön/arka safı değiştir.'),'Your heroes are placed in their preferred row. Change FRONT/BACK if you like.');
 assert.match(translate('Saf değişikliği bu cihazda saklandı. Hazırım ile tekrar gönderilecek.'),/row change is saved/);
});
