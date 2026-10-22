import test from 'node:test';
import assert from 'node:assert/strict';
import {translate, localizeNode} from '../public/crazygames-en.js';

// Minimal DOM-shaped nodes exercise the localizer without adding a browser dependency.
function element(selector='',attrs={}) {
 const node={nodeType:1,tagName:'SPAN',childNodes:[],attrs:{...attrs},
  matches(query){return query.split(',').includes(selector)},
  closest(query){return this.matches(query)?this:null},
  hasAttribute(key){return Object.hasOwn(this.attrs,key)},
  getAttribute(key){return this.attrs[key]},setAttribute(key,value){this.attrs[key]=value}};
 node.text=value=>{const child={nodeType:3,nodeValue:value,parentElement:node};node.childNodes.push(child);return child};
 return node;
}

test('English covers late-rendered battle roles, controls and victory states',()=>{
 const samples={
  'Saldırı Komutanı · Savaşçı / Suikastçı':'Attack Commander · Fighter / Assassin',
  '⚔️ SAVAŞÇI':'⚔️ FIGHTER','ENERJİ / MESAFELİ':'ENERGY / RANGED',
  '✓ SAVAŞ TAMAMLANDI':'✓ BATTLE COMPLETE','▶ DEVAM ET':'▶ RESUME','⏸ DURDUR':'⏸ PAUSE',
  '♛ ŞAMPİYON TAKIMIN LİDERİ':'♛ LEADER OF THE CHAMPION TEAM',
  'ARENADAN ELENDİ':'ELIMINATED FROM THE ARENA','AYAKTA':'STANDING',
  'BAĞLANTI SONA ERDİ':'CONNECTION ENDED','KRİTİK':'CRITICAL',
  'Kahramanların ve komutanın savaştaki katkısı.':'Your heroes’ and commander’s contributions to the battle.'
 };
 for(const [tr,en] of Object.entries(samples))assert.equal(translate(tr),en);
});

test('dynamic summaries preserve numbers and localize units',()=>{
 assert.equal(translate('Komutan · 2 beceri · 120 hasar · 35 şifa · 7 kalkan'),'Commander · 2 abilities · 120 damage · 35 healing · 7 shield');
 assert.equal(translate('Rakibin dizilişi bekleniyor… 1/2 hazır'),'Waiting for the opponent’s formation… 1/2 ready');
 assert.equal(translate('Komutan önizleme katkısı (12.5%)'),'Commander preview contribution (12.5%)');
 assert.equal(translate('Tur 3 · KRİTİK · Kalkan 15 engelledi'),'Round 3 · CRITICAL · Shield 15 blocked');
 assert.equal(translate('Savunmayı %12,5 artırır'),'Increases defense by 12.5%');
});

test('short labels do not replace fragments inside words or English copy',()=>{
 for(const name of ['Ruh Dokuyucu','Canan','Hızır','Turhan','Cancel','Canvas','Normal'])assert.equal(translate(name),name);
});

test('name, chat, editable content and portrait identities remain unchanged',()=>{
 for(const selector of ['.card-name','.side-hero-name','.board-hero-name','.victory-podium-name','.arena-final-knockout-hero','.victory-player-name','#hero-modal-name','#account-name','.battle-hero-stat-row > strong','.chat-text','.chat-author','[translate="no"]','textarea','[contenteditable="true"]']){
  const node=element(selector);const text=node.text('Can Savaşçı');localizeNode(node);assert.equal(text.nodeValue,'Can Savaşçı',selector);
 }
 const player=element('.player .name');const name=player.text('Can (SEN)');localizeNode(player);assert.equal(name.nodeValue,'Can (YOU)');
 const image=element('',{alt:'Savaşçı'});image.tagName='IMG';localizeNode(image);assert.equal(image.attrs.alt,'Savaşçı');
});

test('UI attributes localize without changing input values or data attributes',()=>{
 const input=element('',{placeholder:'Oyuncu adın',value:'Savaşçı','data-role':'support','aria-label':'Sesi kapat'});input.tagName='INPUT';input.value='Can';
 localizeNode(input);
 assert.deepEqual(input.attrs,{placeholder:'Your name',value:'Savaşçı','data-role':'support','aria-label':'Mute audio'});
 assert.equal(input.value,'Can');
 const hero=element('.side-hero-name');hero.text('Can');const rarity=element();rarity.text('NADİR');hero.childNodes.push(rarity);localizeNode(hero);assert.equal(rarity.childNodes[0].nodeValue,'RARE');
});
