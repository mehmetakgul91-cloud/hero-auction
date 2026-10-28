import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commanderIntroductions,describeFirstCommander,mountFirstSession} from '../public/first-session.js';
import {guideSteps} from '../public/first-match-guide.js';
import {createCommanderProfile,commanderStatBonus} from '../arena-commanders.js';
import {commanderAbilityStats} from '../public/commander-ability-rules.js';
import {crazyGamesSource} from '../crazygames-build.js';
class Node{
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.dataset={};this.text='';this.hidden=false;}
 set textContent(s){this.text=String(s);this.children=[];}get textContent(){return this.text+this.children.map(x=>x.textContent).join(' ')}
 append(...items){this.children.push(...items);} replaceChildren(...items){this.text='';this.children=items;} setAttribute(k,v){this.attributes[k]=v;}
 after(node){this.ownerDocument.nodes[node.id]=node;}
}
function fixture(enabled=true){const doc={nodes:{},documentElement:{classList:{contains:()=>enabled}},createElement:tag=>new Node(tag,doc),getElementById:id=>doc.nodes[id]};doc.nodes['commander-onboarding']=new Node('section',doc);const root=new Node('div',doc);for(const id of Object.keys(commanderIntroductions)){const b=new Node('button',doc);b.dataset.commander=id;root.append(b);}return{doc,root};}
for(const id of Object.keys(commanderIntroductions))test(`${id} onboarding reuses actual zero-level skills without spending or changing profile`,()=>{
 const {doc,root}=fixture();describeFirstCommander(root,id,{document:doc});const detail=doc.nodes['first-commander-details'];
 assert.equal(detail.hidden,false);assert.match(detail.textContent,/no upgrade bonus/);assert.match(detail.textContent,/NORMAL ABILITY/);assert.match(detail.textContent,/ULTIMATE/);assert.match(detail.textContent,/40 NORMAL ENERGY/);
 const profile=createCommanderProfile(id);assert.equal(commanderStatBonus(profile,id),0);const stats=commanderAbilityStats(profile);
 if(id!=='magic')assert.ok(detail.textContent.includes(String(stats.normalRate*100)+'%'));else assert.match(detail.textContent,/1 ATTACK/);
 assert.equal(root.children.length,4);assert.ok(root.children.every(b=>b.children.length===1));
});
test('normal site is untouched and unselected state never invents a commander',()=>{
 const a=fixture(false);describeFirstCommander(a.root,'attack',{document:a.doc});assert.equal(a.doc.nodes['first-commander-details'],undefined);
 const b=fixture();describeFirstCommander(b.root,null,{document:b.doc});assert.equal(b.doc.nodes['first-commander-details'].hidden,true);assert.equal(b.doc.nodes['first-commander-details'].children.length,0);
 mountFirstSession({}, {enabled:false});
});
test('changing selected commander replaces details instead of accumulating old abilities',()=>{
 const {doc,root}=fixture();describeFirstCommander(root,'attack',{document:doc});root.replaceChildren();describeFirstCommander(root,'support',{document:doc});const text=doc.nodes['first-commander-details'].textContent;assert.match(text,/Healing Touch/);assert.doesNotMatch(text,/Power Strike/);
});
test('bilingual tutorial matches automatic role formation and retains manual row choice',()=>{
 assert.match(guideSteps.en[1][1],/automatically by role/);assert.match(guideSteps.en[1][1],/Front \/ Back/);assert.doesNotMatch(guideSteps.en[1][1],/slot|swap/);assert.match(guideSteps.tr[1][1],/otomatik/);assert.doesNotMatch(guideSteps.tr[1][1],/yuvaya|yer değiştirir/);
});
test('portal compact guide moves existing controls and never starts a match',()=>{
 const src=readFileSync('public/first-session.js','utf8');assert.match(src,/modes.prepend\(bot\)/);assert.doesNotMatch(src,/cloneNode|fetch\(|\.post\(|getElementById\('bot'\)\.click/);assert.match(src,/1000 gold/);assert.match(src,/mountFirstSession/);
 const app=readFileSync('public/app.js','utf8');assert.match(app,/mountFirstSession\(document,\{enabled:!!window.HeroPlatform\}\)/);
 assert.match(crazyGamesSource(src,'.js'),/\.\/commander-profile-view\.js/);
});
test('readability rules preserve whole role words and allow power label wrapping after shared theme',()=>{
 const css=readFileSync('public/first-session.css','utf8');assert.match(css,/side-hero-role\{[^}]*grid-column:1\/-1[^}]*word-break:normal[^}]*overflow-wrap:normal/);assert.match(css,/board-hero-power\{white-space:normal/);assert.doesNotMatch(css,/text-overflow:ellipsis|overflow:hidden/);
 for(const file of ['index.html','battle-preview.html']){const html=readFileSync('public/'+file,'utf8');assert.ok(html.indexOf('/first-session.css')<html.indexOf('/theme.css'));}
});
