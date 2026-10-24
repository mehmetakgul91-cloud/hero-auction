import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {translate} from '../public/crazygames-en.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('battle-preview.html'),css=read('battle-preview.css'),source=read('battle-preview.js');
const formation=html.slice(html.indexOf('<section class="formation"'),html.indexOf('<div class="arena-commander-matchup"'));
const details=formation.slice(formation.indexOf('<details id="commander-bonus-detail"'),formation.indexOf('<details id="preparation-help"'));
const setup=formation.slice(0,formation.indexOf('<div class="battle-board"'));

test('preparation shows essential state and selectable heroes before the board, not a wall of introduction',()=>{
 for(const id of ['preparation-title','prep-clock','ready-a','ready-b','formation-placed-count','formation-current-power','role-pickers'])assert.ok(setup.includes(`id="${id}"`),id);
 for(const id of ['formation-base-power','formation-power-change'])assert.ok(details.includes(`id="${id}"`),id);
 assert.doesNotMatch(setup,/<details|class="intro"|<header>|5 × 5 OTOMATİK SAVAŞ/);
 assert.ok(formation.indexOf('id="role-pickers"')<formation.indexOf('class="battle-board"'));
 assert.ok(formation.indexOf('class="battle-board"')<formation.indexOf('id="apply-roles"'));
 assert.ok(formation.indexOf('id="apply-roles"')<formation.indexOf('id="commander-bonus-detail"'));
 assert.match(formation,/<button id="apply-roles">✓ HAZIRIM<\/button>\s*<p id="prep-note" role="status">60 saniye/);
 assert.match(setup,/id="prep-clock" role="timer" aria-label="Hazırlık için kalan süre"/);
 assert.match(setup,/id="role-pickers"[^>]*aria-label="Yerleştirilecek kahramanlar"/);
 assert.match(html,/class="arena-room-nav">/);
});

test('all existing state targets remain unique, with native optional details and reachable instructions',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ['formation-base-power','formation-power-change','commander-bonus-content','prep-note','role-pickers','apply-roles','front-slots','back-slots'])assert.equal(ids.filter(value=>value===id).length,1,id);
 assert.match(details,/<details id="commander-bonus-detail" class="preparation-detail"><summary>/);
 assert.match(formation,/<details id="preparation-help" class="preparation-detail"><summary>Nasıl oynanır\?<\/summary>/);
 assert.doesNotMatch(formation,/<details[^>]*\bopen\b/);
 assert.match(details,/Bu gösterge tahmini güç puanıdır; savaşın kesin sonucunu belirlemez/);
 assert.match(formation,/Kartını seç → Yuvaya dokun → Hazırım\. İstersen sürükleyip bırak\./);
 assert.ok(formation.indexOf('class="intro"')>formation.indexOf('id="preparation-help"'));
});

test('prep controls keep touch targets, focus cues and separate sizing from fitted combat',()=>{
 assert.match(css,/\.preparation-detail>summary\{min-height:44px/);
 assert.match(css,/\.preparation-detail>summary:focus-visible\{outline:3px/);
 assert.match(css,/\.formation \.battle-board \.lane-switch\{min-height:44px/);
 assert.match(css,/\.formation \.battle-board \.board-slot\{min-width:44px;min-height:44px\}/);
 assert.match(css,/\.formation \.battle-board \.board-row\{flex-wrap:wrap\}/);
 assert.match(css,/\.formation \.battle-board \.slot-wrap\{flex:1 1 80px;min-width:80px;max-width:104px\}/);
 assert.match(css,/\.preparation-detail \.formation-power-explanation\{display:block/);
 const compact=css.slice(css.indexOf('/* Preparation prioritizes'));
 assert.doesNotMatch(compact,/\.arena-fit|(?:^|})\s*body\s*\{|\.arena-room\s/);
 assert.match(compact,/body:not\(\.arena-room\) #arena-music-toggle/);
 assert.match(compact,/body:not\(\.arena-room\) \.arena-room-nav>\.arena-prep-link\{display:none\}/);
});

class Element {
 children=[];dataset={};style={};attributes={};textContent='';open=false;
 classList={toggle(){}};
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this.attributes[name]=value;}
}
function preparationHarness(){
 const ids=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
 const help=new Element();
 const document={createElement:()=>new Element(),querySelector:selector=>selector==='.board-help'?help:null};
 const context={document,$:id=>ids[id],clearHover(){},renderRolePickers(){},attachDrag(){},heroPortrait(){},creditBonus:()=>0,commanderBonusForRole:()=>0};
 const code=source.slice(source.indexOf('function placeHero('),source.indexOf('function attachDrag('));
 const laneCode=source.slice(source.indexOf('function roleAt('),source.indexOf('const heroArtCache='));
 runInNewContext(`const demoA=[['Hero A','tank',90],['Hero B','fighter',69],['Hero C','energy',80],['Hero D','fighter',83],['Hero E','support',90]];
 const assignedRoles=demoA.map(hero=>hero[1]),positions=[null,null,null,null,null],lanes=['front','front','back','back','back'];
 const roleNames={tank:'TANK',fighter:'FIGHTER',energy:'ENERGY',support:'SUPPORT'},roleIcons={};
 let preparationDock=null,prepDone=false,selectedHero=null,lastFormationDrag=0,auctionMode=false,auctionLaneModifiers=[],previewCredits=0;
 ${laneCode}${code}
 this.actions={renderBoard,placeHero,setLane,completeSlots,select(hero){selectedHero=hero},snapshot(){return [...positions]}};`,context);
 return {ids,help,actions:context.actions};
}

test('select, place, move, swap and repeat update the retained state without resetting optional disclosures',()=>{
 const h=preparationHarness();h.actions.renderBoard();
 assert.equal(h.ids['formation-placed-count'].textContent,'0 / 5');
 h.ids['commander-bonus-detail'].open=true;h.ids['preparation-help'].open=true;
 h.actions.select(0);h.ids['front-slots'].children[0].children[1].onclick();
 assert.equal(h.ids['formation-placed-count'].textContent,'1 / 5');
 assert.equal(h.ids['formation-base-power'].textContent,'90.00');
 assert.equal(h.ids['formation-current-power'].textContent,'90.00');
 h.actions.placeHero(1,1);h.actions.placeHero(0,1);
 assert.deepEqual(Array.from(h.actions.snapshot()),[1,0,null,null,null]);
 h.actions.setLane(1,'back');h.actions.renderBoard();h.actions.placeHero(0,1);
 assert.equal(h.ids['formation-placed-count'].textContent,'2 / 5');
 assert.equal(h.ids['formation-current-power'].textContent,'159.00');
 assert.equal(h.ids['commander-bonus-detail'].open,true);assert.equal(h.ids['preparation-help'].open,true);
 h.ids['commander-bonus-detail'].open=false;h.actions.completeSlots();h.actions.renderBoard();
 assert.equal(h.ids['formation-placed-count'].textContent,'5 / 5');
 assert.equal(h.ids['commander-bonus-detail'].open,false);assert.equal(h.ids['preparation-help'].open,true);
 assert.match(h.help.textContent,/Kahraman yerleştirildi/);
});

test('new prep labels translate for the existing English portal',()=>{
 assert.equal(translate('Hazırlık için kalan süre'),'Preparation time remaining');
 assert.equal(translate('Yerleştirilecek kahramanlar'),'Heroes to place');
 assert.equal(translate('Nasıl oynanır?'),'How to play?');
 assert.equal(translate('Öne al'),'Move to front');assert.equal(translate('Arkaya al'),'Move to back');
 assert.equal(translate('Kahraman bilgileri ve roller'),'Hero details and roles');
});
