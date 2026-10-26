import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {crazyGamesSource} from '../crazygames-build.js';

const publicFile=name=>readFileSync(new URL(`../public/${name}`,import.meta.url),'utf8');
const css=publicFile('theme.css');
// Weather geometry is separately scoped and tested; the accepted page theme stays visual-only.
const baseCss=css.split('/* Cosmetic arena weather — selected scene only, finite noninteractive bursts. */')[0];
const pages=['index','kahramanlar','ligler','privacy','crazygames-privacy','music-credits','battle-preview','arena-3d','arena-model','commander-training'];

test('accepted theme loads once, last in every active public document, preserving original styles',()=>{
 for(const page of pages){
  const html=publicFile(page+'.html'),head=html.slice(0,html.indexOf('</head>'));
  assert.equal((head.match(/href="\/theme\.css\?v=accepted-gray-20261026"/g)||[]).length,1,page);
  assert.match(head,/<link rel="stylesheet" href="\/theme\.css\?v=accepted-gray-20261026">$/,page);
  if(['privacy','crazygames-privacy','music-credits','commander-training'].includes(page))assert.match(html,new RegExp(`data-theme-page="${page}"`));
 }
 assert.match(publicFile('index.html'),/href="\/style\.css\?/);
 assert.match(publicFile('index.html'),/href="\/commander-profile\.css\?/);
 assert.match(publicFile('battle-preview.html'),/href="\/battle-preview\.css\?/);
 assert.match(publicFile('kahramanlar.html'),/href="\/kahramanlar\.css\?/);
});

test('theme preserves behavior, visibility and geometry apart from the scoped masthead layer',()=>{
 // One reviewed masthead layer repairs account dropdown stacking; no other z-index is allowed.
 const clean=baseCss.replace(/\/\*[\s\S]*?\*\//g,'').replace('.shell>.lobby-header{z-index:1;','.shell>.lobby-header{');
 assert.doesNotMatch(clean,/(?:^|[;{])\s*(?:display|visibility|position|z-index|pointer-events|content|width|height|min-width|max-width|min-height|max-height|overflow(?:-x|-y)?|grid-template-columns|touch-action|user-select)\s*:/m);
 assert.doesNotMatch(clean,/@import|https?:\/\/|url\([^)]*data:/);
 assert.doesNotMatch(clean,/\b(?:img|canvas|svg)\s*\{[^}]*\bfilter\s*:[^;}]*(?:brightness|invert|saturate|grayscale|hue-rotate)\(/);
 assert.match(clean,/prefers-reduced-motion:reduce/);
 assert.match(clean,/forced-colors:active/);
});

test('CrazyGames keeps shared theme asset and its existing restricted features hidden',()=>{
 const cg=crazyGamesSource(publicFile('index.html'),'.html');
 assert.match(cg,/<html lang="en">/);
 assert.match(cg,/href="\/theme\.css\?v=accepted-gray-20261026"/);
 assert.doesNotMatch(cg,/href="\/crazygames\/theme\.css/);
 assert.match(cg,/#home-store-tab,#store-panel,[^}]*display:none!important/);
 assert.doesNotMatch(cg,/<script\b[^>]*src="https:\/\/(?:pagead2|accounts\.google)/);
 assert.match(css,/#home \.home-quick-nav \.quick-nav-store/);
 assert.doesNotMatch(css,/#(?:home-store-tab|store-panel)[^{]*\{[^}]*display\s*:/);
});

test('accepted home keeps six real navigation actions, contact and no light-mode toggle UI',()=>{
 const html=publicFile('index.html');
 for(const label of ['Oyna','Komutan','Kahramanlar','Arkadaşlar','Mağaza','İletişim'])assert.ok(html.includes(`<span class="nav-label">${label}</span>`),label);
 assert.match(html,/mailto:destek@heroauction\.com\.tr/);
 assert.doesNotMatch(html,/data-theme-toggle|id="theme-toggle"/);
});

const luminance=hex=>{
 const values=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return values.reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
};
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('approved broad surfaces stay at or below the accepted off-white luminance ceiling',()=>{
 const ceiling=luminance('#f8f7f3');
 const clean=baseCss.replace(/\/\*[\s\S]*?\*\//g,'');
 for(const [,value] of clean.matchAll(/(?:^|[;{])\s*background(?:-color|-image)?\s*:([^;}]+)/gm)){
  for(const [hex] of value.matchAll(/#[0-9a-f]{6}(?![0-9a-f])/gi))assert.ok(luminance(hex)<=ceiling+1e-9,`${hex} exceeds accepted surface`);
  assert.doesNotMatch(value,/(?:^|[\s,(])(?:white|#fff)(?:[\s,)]|$)/i);
 }
});

test('representative light, gold, secondary and slate text pairs meet WCAG AA',()=>{
 const pairs=[['#203047','#e9ede9'],['#586676','#e9ede9'],['#80642e','#f8f7f3'],['#203047','#d7b97d'],['#5f6a77','#e9ede9'],['#3d6a59','#dee9e2'],['#536e7a','#e9ede9'],['#e9eee9','#314154']];
 for(const [fg,bg] of pairs)assert.ok(contrast(fg,bg)>=4.5,`${fg} on ${bg}`);
});

test('disabled authentication and play actions override their active ID-specific colors',()=>{
 assert.match(css,/#login-gate #guest-login:disabled\{[^}]*background:#d8ded8!important;[^}]*color:#536171!important/);
 assert.match(css,/#home #home-play-panel :is\(#match,#create,#bot\):disabled\{[^}]*color:#536171;[^}]*background:#d8ded8/);
 assert.ok(contrast('#536171','#d8ded8')>=4.5); // disabled controls also retain normal-text AA contrast
});

test('rarity and live combat resource colors are not globally remapped by the theme',()=>{
 assert.doesNotMatch(css,/(?:--rarity-accent|--hp|--health|--energy)\s*:/);
 assert.doesNotMatch(css,/(?:^|\})\s*\.(?:hp-fill|energy-fill|shield-fill)\s*\{/);
 assert.match(css,/#game \.rarity\{background:#263548\}/);
});

test('canonical and CrazyGames HTTP documents serve the exact shared theme without feature changes',{timeout:15000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_DIAMONDS_ENABLED:'0',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'0',HERO_DIAMOND_EXCHANGE_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,30));}assert.ok(ready,logs);
  for(const prefix of ['','/crazygames']){
   const theme=await fetch(base+prefix+'/theme.css?v=accepted-gray-20261026');assert.equal(theme.status,200);assert.match(theme.headers.get('content-type'),/text\/css/);assert.equal(await theme.text(),css);
   for(const page of ['','kahramanlar.html','battle-preview.html','ligler.html']){
    const response=await fetch(base+prefix+'/'+page);assert.equal(response.status,200);const text=await response.text();assert.match(text,/href="\/theme\.css\?v=accepted-gray-20261026"/);
    if(prefix&&page==='')assert.match(text,/#home-store-tab,#store-panel,[^}]*display:none!important/);
   }
  }
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref();});}
});


test('preparation board hint overrides original important pale-gold text with AA contrast',()=>{
 assert.match(publicFile('battle-preview.css'),/\.board-help\{[^}]*color:#f5de98!important/);
 assert.match(css,/body:has\(#battle-arena\) \.formation \.board-help\{color:#586676!important\}/);
 assert.ok(contrast('#586676','#f1f2ee')>=4.5);
});


test('account dropdown escapes the later home context without overtaking global overlays',()=>{
 assert.match(publicFile('lobby-chrome.css'),/\.shell>\.lobby-header\{[^}]*position:relative;isolation:isolate/);
 assert.match(publicFile('style.css'),/#home\.cinema-home\{[^}]*position:relative;isolation:isolate/);
 assert.match(css,/\.shell>\.lobby-header\{z-index:1;/);
 assert.deepEqual([...baseCss.matchAll(/z-index\s*:\s*([^;}]+)/g)].map(m=>m[1]),['1']);
 assert.match(publicFile('lobby-chrome.css'),/\.lobby-header \.account-bar #google-logout\{[^}]*z-index:20/);
 assert.match(publicFile('style.css'),/#toast\{[^}]*z-index:5/);
 assert.match(publicFile('room-invites.css'),/\.room-invites\s*\{[^}]*z-index:12000/);
 assert.doesNotMatch(css,/\.shell>\.lobby-header\{[^}]*overflow\s*:/);
});
