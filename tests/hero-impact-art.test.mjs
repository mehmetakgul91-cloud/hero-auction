import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroImpactArtwork,appendHeroImpactArt} from '../public/hero-impact-art.js';
import {playHeroAttack,heroAttackTiming} from '../public/hero-attack-effects.js';
const signatures=['blade','dagger','hammer','arrow','magic','lightning','light'];
function fixture(){
 const el=tag=>({tag,children:[],attributes:{},style:{props:{},setProperty(k,v){this.props[k]=v}},setAttribute(k,v){this.attributes[k]=String(v)},append(n){this.children.push(n)},querySelector(){return null},getBoundingClientRect(){return {left:40,top:40,width:54,height:54}}});
 const document={createElement:el,createElementNS:(ns,tag)=>el(tag),body:el('body')};
 const nodes=[],effects={node(n,host,ms){host.append(n);nodes.push({node:n,ms})}};
 return {document,effects,nodes,actor:el('actor'),target:el('target')};
}
test('damage contacts have seven distinct open-path identities, with bounded special fragments',()=>{
 const unique=new Set();
 for(const signature of signatures){
  const basic=heroImpactArtwork(signature),special=heroImpactArtwork(signature,true);
  unique.add(basic.strokes.join('|'));assert.equal(basic.fragments.length,4);assert.equal(special.fragments.length,6);
  assert.ok(special.strokes.length>=basic.strokes.length);
  for(const art of [basic,special]){
   for(const stroke of art.strokes){assert.match(stroke,/^M/);assert.doesNotMatch(stroke,/[zZ]/);}
   for(const p of art.fragments){
    assert.ok(p.length<=11);assert.ok(Math.hypot(p.dx,p.dy)<=27.000001);
    assert.ok(p.x+p.dx>=0&&p.x+p.dx<=100);assert.ok(p.y+p.dy>=0&&p.y+p.dy<=100);
   }
  }
 }
 assert.equal(unique.size,7);assert.equal(heroImpactArtwork('heal'),null);assert.equal(heroImpactArtwork('shield'),null);
});
test('SVG is decorative, contains only unfilled strokes, and uses no raster or central glyph',()=>{
 const {document}=fixture();
 for(const signature of signatures){
  const root=document.createElement('span');assert.equal(appendHeroImpactArt(document,root,signature,true),true);
  const svg=root.children[0];assert.equal(svg.tag,'svg');assert.equal(svg.attributes['aria-hidden'],'true');assert.equal(svg.attributes.focusable,'false');
  const paths=svg.children.flatMap(n=>n.tag==='g'?n.children:[n]);
  assert.ok(paths.length<=15);assert.ok(paths.every(n=>n.tag==='path'&&n.attributes.fill==='none'));
  assert.ok(paths.every(n=>!n.attributes.href));
 }
});
test('normal/special impact is smaller than old stickers, while cast/travel timing and owner lifetime stay unchanged',()=>{
 for(const special of [false,true]){
  const h=fixture();const t=playHeroAttack({...h,hero:{role:'assassin'},kind:'strike',special,time:850});
  const impact=h.nodes.at(-1);assert.match(impact.node.className,/hero-contact/);assert.equal(impact.node.children[0].tag,'svg');
  assert.equal(impact.node.style.props['--hero-delay'],(special?840:600)+'ms');
  assert.equal(impact.ms,t.total+80);assert.equal(t.total,special?1900:1400);
  assert.ok(parseFloat(impact.node.style.props['--hero-size'])<65);
  assert.equal(h.nodes[0].node.children.length,4); // unchanged caster art
 }
});
test('heal/shield retain restorative protection art and no damaging slash fragments',()=>{
 for(const kind of ['heal','shield']){
  const h=fixture();playHeroAttack({...h,hero:{role:'support'},kind,special:true,target:h.actor});
  assert.equal(h.nodes.length,1);assert.doesNotMatch(h.nodes[0].node.className,/hero-contact/);
  assert.ok(h.nodes[0].node.children.every(n=>n.tag==='i'));
 }
});
test('contact has one short sweep then fading fragments; no persistent glyph, box, strobe or loop',()=>{
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 const contact=css.slice(css.indexOf('/* Damaging contact replaces'));
 assert.match(contact,/::after\{content:none;display:none\}/);
 assert.match(contact,/68%\{opacity:0;stroke-dashoffset/);
 assert.match(contact,/heroContactScatter/);assert.match(contact,/--stroke-lag/);
 assert.match(contact,/primary-target\{outline:0;box-shadow:none!important\}/);
 assert.doesNotMatch(contact,/infinite|brightness\(|background:|filter:drop-shadow/);
 assert.equal(heroAttackTiming(850).total,1400);assert.equal(heroAttackTiming(850,{special:true}).total,1900);
});

test('natural-size geometry has a contrasting core and an explicit visible sweep window',()=>{
 const {document}=fixture();
 for(const special of [false,true]){
  const root=document.createElement('span');appendHeroImpactArt(document,root,'blade',special);
  const paths=root.children[0].children.filter(n=>n.tag==='path');
  const shade=paths.find(n=>n.attributes.class.includes('shade')),core=paths.find(n=>n.attributes.class.includes('core'));
  assert.ok(Number(shade.attributes['stroke-width'])*.6>=4.8);
  assert.ok(Number(core.attributes['stroke-width'])*.6>=1.44);
 }
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 assert.match(css,/shade\{stroke:#101c2e;stroke-opacity:.92/);
 assert.match(css,/52%\{opacity:1;stroke-dashoffset:-.2/);
 assert.doesNotMatch(css,/hero-contact-stroke.core\{[^}]*stroke-width/); // do not silently override per-signature core width
});
