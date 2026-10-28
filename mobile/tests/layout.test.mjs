import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountNativeLayout,nativeViewport} from '../src/layout.js';
import {adaptSource} from '../scripts/build.mjs';

// Structural/state tests only: linkedom does not perform browser layout or
// Android touch/font rendering. Viewport inputs below are not visual-fit proof.
const player=()=>'<div class="name">Oyuncu</div><div class="credit">20</div><div class="spent-credit">0 kredi</div><div class="side-team-title">Kartlar</div><div class="teams"><span>Obsidyen Muhafız</span></div>';
const hero=(round=1)=>`<div class="auction-hero"><div class="eyebrow">KART ${round} / 10</div><div class="card-name">Obsidyen Muhafız</div><div id="auction-lane-bonuses">Ön +10%</div><div id="auction-abilities">Aktif ve pasif</div><p id="hero-description">Eksiksiz açıklama</p></div><div class="auction-action"><button id="bidbutton">Teklif ver</button></div>`;
async function harness(kind='arena') {
 const {document,window:dom}=parseHTML(`<html class="hero-native"><body class="${kind==='arena'?'arena-room arena-fit':''}"><aside id="native-status">Android test</aside><main class="shell"><header id="header">Hesap</header><div class="account-bar">Misafir</div><nav class="arena-room-nav"><a class="arena-home-link">Maçtan ayrıl</a><strong>Arena</strong><a class="arena-prep-link">Hazırlık</a><button id="arena-friend-opponent">Arkadaş ekle</button><details class="arena-invites-inbox"><summary>Davetler</summary></details></nav><div id="battle-arena" ${kind==='arena'?'':'hidden'}><section class="arena-side"><div class="team" style="--arena-row-count:3"></div></section></div><div class="controls"><div class="settings"><select id="speed"><option>Normal</option></select></div></div><section class="log"><ol id="events"><li>Son hamle</li></ol></section><section id="game" data-phase="${kind==='auction'?'auction':'waiting'}" ${kind==='auction'?'':'hidden'}><div class="room-tools"><span id="phase">Kart 1</span></div><aside id="player0" class="player-side">${player()}</aside><aside id="player1" class="player-side">${player()}</aside><div id="stage">${hero()}</div><button id="friend-opponent">Arkadaş ekle</button><section id="chat-panel"><input id="chat-input"></section><details id="activity"><summary>Teklif geçmişi</summary></details><button id="leave">Odadan ayrıl</button></section><footer id="footer">İletişim</footer></main><details id="moderation-panel"><summary>Güvenlik</summary><textarea id="report"></textarea><button id="report-send">Şikâyet gönder</button></details></body></html>`);
 Object.defineProperty(document,'activeElement',{writable:true,value:null});
 const frames=new Map();let id=0,totalFrames=0;
 const viewport=Object.assign(new EventTarget(),{height:640,scale:1});
 const window=Object.assign(new EventTarget(),{innerWidth:360,innerHeight:640,visualViewport:viewport,MutationObserver:dom.MutationObserver,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key)});
 const destroy=mountNativeLayout({window,document});
 async function flush(){for(let n=0;n<12;n++){await Promise.resolve();if(!frames.size){await Promise.resolve();if(!frames.size)return;}for(const [i,fn]of [...frames]){frames.delete(i);totalFrames++;fn();}}throw Error('Mutation/layout observer failed to settle');}
 await flush();return {window,document,viewport,destroy,flush,dom,get totalFrames(){return totalFrames},find:s=>document.querySelector(s)};
}
test('baseline native height budget protects hero rows across portrait and landscape inputs',()=>{
 for(const [width,height]of [[320,480],[360,640],[390,844],[430,932],[740,360],[844,390]]){
  for(const rows of [1,3,5]){
   const size=nativeViewport({width,height,rows});assert.equal(size.height,height);
   // Arena/side padding+borders plus up to four team gaps must fit as well.
   assert.ok(size.arenaMin>=rows*74+18+3*(rows-1));
  }
 }
});
test('arena relocates original safety/social/log nodes with listeners and restores exact parents',async()=>{
 const h=await harness();try{
  const safety=h.find('#moderation-panel'),friend=h.find('#arena-friend-opponent'),log=h.find('.log');
  assert.ok(h.find('.native-menu-panel').contains(safety));assert.ok(h.find('.native-menu-panel').contains(friend));assert.ok(h.find('.native-menu-panel').contains(log));
  let clicks=0;friend.addEventListener('click',()=>clicks++);friend.click();assert.equal(clicks,1);
  assert.equal(h.find('#native-game-menu>summary').getAttribute('aria-controls'),'native-menu-panel');
  h.document.body.classList.remove('arena-room');await h.flush();
  assert.equal(h.find('#native-game-menu'),null);assert.equal(safety.parentNode,h.document.body);assert.equal(friend.parentNode,h.find('.arena-room-nav'));assert.equal(log.parentNode,h.find('.shell'));
  friend.click();assert.equal(clicks,2);assert.equal(h.find('#native-status').nextElementSibling,h.find('.shell'));
 }finally{h.destroy();}
});
test('late safety mount moves only once and observer settles; closing menu restores focus',async()=>{
 const h=await harness();try{
  const original=h.find('#moderation-panel');original.remove();await h.flush();h.document.body.append(original);await h.flush();
  const count=h.totalFrames;h.window.dispatchEvent(new Event('resize'));await h.flush();assert.ok(h.totalFrames-count<=2);
  const summary=h.find('#native-game-menu>summary');let focus=0;summary.focus=()=>focus++;
  h.find('#native-game-menu').open=true;h.find('.native-menu-close').click();assert.equal(h.find('#native-game-menu').open,false);assert.equal(focus,1);
  h.find('#native-game-menu').open=true;const escape=new h.dom.Event('keydown');escape.key='Escape';h.document.dispatchEvent(escape);assert.equal(h.find('#native-game-menu').open,false);assert.equal(focus,2);
 }finally{h.destroy();}
});
test('auction preserves the shared web tree, visible ability content and original callbacks across snapshots',async()=>{
 const h=await harness('auction');try{
  const game=h.find('#game'),header=h.find('#header'),safety=h.find('#moderation-panel');
  assert.ok(h.document.body.classList.contains('native-auction'));
  assert.equal(h.find('#native-game-menu'),null);
  assert.equal(h.find('.native-hero-details'),null);
  assert.equal(h.find('.native-player-details'),null);
  assert.equal(header.parentNode,h.find('.shell'));
  assert.equal(safety.parentNode,h.document.body);
  assert.equal(h.find('#leave').parentNode,game);
  assert.equal(h.find('#chat-panel').parentNode,game);
  for(const selector of ['#auction-lane-bonuses','#auction-abilities','#hero-description'])assert.equal(h.find(selector).parentNode,h.find('.auction-hero'));
  assert.equal(h.find('#player0 .teams').parentNode,h.find('#player0'));
  let bid=0;h.find('#bidbutton').addEventListener('click',()=>bid++);h.find('#bidbutton').click();assert.equal(bid,1);
  h.find('#player0').innerHTML=player();h.find('#stage').innerHTML=hero(2);
  const snapshot=game.innerHTML;await h.flush();assert.equal(game.innerHTML,snapshot);
  h.window.dispatchEvent(new Event('resize'));await h.flush();assert.equal(game.innerHTML,snapshot);
  game.dataset.phase='finished';await h.flush();assert.ok(!h.document.body.classList.contains('native-auction'));
  assert.equal(h.find('#native-game-menu'),null);
 }finally{h.destroy();}
});
test('keyboard visual viewport and pinch zoom preserve scroll fallback without gameplay navigation',async()=>{
 const h=await harness();try{
  h.document.activeElement=h.find('#report');h.viewport.height=320;h.document.dispatchEvent(new h.dom.Event('focusin'));await h.flush();
  assert.ok(h.document.body.classList.contains('native-keyboard'));assert.equal(h.document.documentElement.style.getPropertyValue('--native-viewport-height'),'320px');
  h.viewport.scale=2;h.viewport.height=200;h.window.dispatchEvent(new Event('resize'));await h.flush();assert.ok(h.document.body.classList.contains('native-zoomed'));assert.equal(h.document.documentElement.style.getPropertyValue('--native-viewport-height'),'640px');
 }finally{h.destroy();}
});
test('native stylesheet is last, scoped and retains document scrolling plus44px controls',async()=>{
 const source=await readFile(new URL('../../public/battle-preview.html',import.meta.url),'utf8'),html=adaptSource(source,'battle-preview.html');
 assert.match(html,/<html class="hero-native"/);assert.ok(html.lastIndexOf('/native.css')>html.lastIndexOf('/moderation.css'));
 const css=await readFile(new URL('../src/native.css',import.meta.url),'utf8');
 assert.match(css,/overflow-x:hidden;overflow-y:auto/);assert.match(css,/min-height:44px/);assert.match(css,/native-keyboard,.native-zoomed/);assert.doesNotMatch(css,/body[^}]*overflow:hidden/);
});
test('fullscreen native menu contains keyboard focus and keeps readable rem-based hero labels',async()=>{
 const h=await harness();try{
  const menu=h.find('#native-game-menu'),panel=h.find('.native-menu-panel'),close=h.find('.native-menu-close');
  let firstFocus=0,lastFocus=0;close.focus=()=>firstFocus++;
  const candidates=[...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')];
  const last=candidates.at(-1);last.focus=()=>lastFocus++;
  menu.open=true;menu.dispatchEvent(new h.dom.Event('toggle'));assert.equal(firstFocus,1);
  assert.equal(panel.getAttribute('aria-modal'),'true');
  h.document.activeElement=last;const tab=new h.dom.Event('keydown',{cancelable:true});tab.key='Tab';h.document.dispatchEvent(tab);assert.equal(firstFocus,2);assert.equal(tab.defaultPrevented,true);
  h.document.activeElement=close;const reverse=new h.dom.Event('keydown',{cancelable:true});reverse.key='Tab';reverse.shiftKey=true;h.document.dispatchEvent(reverse);assert.equal(lastFocus,1);
  const css=await readFile(new URL('../src/native.css',import.meta.url),'utf8');assert.match(css,/--native-label-height:max\(14px,\.875rem\)/);assert.match(css,/height:var\(--native-label-height\);font-size:\.6875rem;line-height:1.2/);
  for(const font of [16,20,24,32]){const line=Math.max(14,font*.875);assert.ok(line>=font*.6875*1.2);}
 }finally{h.destroy();}
});
