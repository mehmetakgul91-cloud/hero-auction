import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBotInfo} from '../public/bot-info.js';
const cap={available:true,version:'bot-free-v2',entryGold:0,difficulties:{easy:{level:15,gold:100,magicDust:0},medium:{level:25,gold:125,magicDust:2},hard:{level:40,gold:175,magicDust:5}}};
function fixture(lang='tr'){
 const events={},label={},trigger={attrs:{},setAttribute(k,v){this.attrs[k]=v},querySelector(){return label},focus(){this.focused=true}},content={attrs:{},setAttribute(k,v){this.attrs[k]=v}},details={open:false,contains:target=>[details,trigger,content,label].includes(target)};
 const document={documentElement:{lang},hidden:false,getElementById:id=>({'bot-info':details,'bot-info-trigger':trigger,'bot-info-content':content}[id]),addEventListener:(event,handler)=>events[event]=handler};
 return {ui:createBotInfo({document}),document,events,label,trigger,content,details};
}
test('info details show exact dynamic rules without a start question in both languages',()=>{
 for(const lang of ['tr','en']){const f=fixture(lang);for(const [difficulty,rule] of Object.entries(cap.difficulties)){f.ui.update(cap,difficulty);assert.ok(f.content.textContent.includes(String(rule.level)));assert.ok(f.content.textContent.includes(String(rule.gold)));assert.match(f.content.textContent,lang==='en'?/no gold is required/:/altın gerekmez/);assert.doesNotMatch(f.content.textContent,/başlatılsın mı|Start a free computer game/);assert.equal(f.details.open,false);}assert.equal(f.label.textContent,lang==='en'?'Info':'Bilgi');}
});
test('info updates while open and unavailable/unknown rules are not misrepresented',()=>{
 const f=fixture();f.details.open=true;f.ui.update(cap,'easy');f.ui.update(cap,'hard');assert.match(f.content.textContent,/175 altın \+ 5 büyü tozu/);assert.equal(f.details.open,true);
 f.ui.update({...cap,available:false},'hard');assert.match(f.content.textContent,/şu anda kullanılamıyor/);
 f.ui.update({...cap,entryGold:50},'hard');assert.match(f.content.textContent,/alınamadı/);assert.doesNotMatch(f.content.textContent,/Giriş ücretsiz/);
});
test('Escape restores focus; outside click/focus and hidden page close without stealing focus',()=>{
 const f=fixture();let prevented=0;f.details.open=true;f.events.keydown({key:'Escape',preventDefault(){prevented++}});assert.equal(f.details.open,false);assert.equal(f.trigger.focused,true);assert.equal(prevented,1);
 f.trigger.focused=false;for(const name of ['click','focusin']){f.details.open=true;f.events[name]({target:f.content});assert.equal(f.details.open,true);f.events[name]({target:{}});assert.equal(f.details.open,false);assert.equal(f.trigger.focused,false);}
 f.details.open=true;f.document.hidden=true;f.events.visibilitychange();assert.equal(f.details.open,false);
 f.details.open=true;f.ui.close();assert.equal(f.details.open,false);
});
test('missing info nodes are safe and info controller cannot make network or wallet operations',()=>{
 const ui=createBotInfo({document:{getElementById(){return null}}});ui.update(cap,'easy');ui.close();
 const source=readFileSync(new URL('../public/bot-info.js',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|post\(|confirm\(|alert\(/);
});
test('info summary is a separate accessible control after play button within bot card',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 const card=html.match(/<section class="play-compact-mode play-compact-bot"[\s\S]*?<\/section>/)[0];
 assert.match(card,/<button id="bot"[^>]*>[\s\S]*?<\/button>\s*<details id="bot-info"/);assert.match(card,/summary id="bot-info-trigger" aria-label=/);assert.match(card,/aria-controls="bot-info-content"/);assert.match(css,/min-height:44px/);assert.match(css,/\.bot-info summary[^}]*margin-left:auto/);
});
