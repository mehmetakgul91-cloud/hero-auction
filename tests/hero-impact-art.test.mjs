import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroImpactArtwork,contactFrame,CONTACT_STYLE,appendHeroImpactArt} from '../public/hero-impact-art.js';
import particles from '../public/hero-contact-particles.js';
test('approved v2 seed84 geometry is deterministic, size bounded and restorative art stays distinct',()=>{
 assert.equal(particles.length,68);assert.equal(CONTACT_STYLE.coreRadius,23);
 for(const signature of ['blade','dagger','hammer','arrow','magic','lightning','light']){
  const a=heroImpactArtwork(signature);assert.deepEqual(a,heroImpactArtwork(signature));assert.equal(a.particles.length,32);
  assert.equal(heroImpactArtwork(signature,true).particles.length,44);
  assert.equal(heroImpactArtwork(signature,true,190).particles.length,68);
  assert.ok(a.particles.every(p=>p.angle>=-.72&&p.angle<=.85&&p.life<=1.12&&p.size>=1.45));
 }
 assert.equal(heroImpactArtwork('heal'),null);assert.equal(heroImpactArtwork('shield'),null);
});
test('ballistic frame follows prototype drag, gravity, tails and single rise/fade envelope',()=>{
 const art={particles:[{angle:0,speed:300,life:1,size:2,delay:0}]};
 const frame=contactFrame(art,.2),p=frame.sparks[0];
 assert.ok(Math.abs(p.x-300*(1-Math.exp(-.6))/3)<1e-10);assert.equal(p.y,42*.2*.2);
 assert.ok(Math.abs(p.tail-8.4*.8)<1e-10);assert.equal(frame.core.radius,25.4);
 assert.equal(contactFrame(art,1.16).sparks.length,0);
 assert.ok(contactFrame(art,.1).core.alpha>contactFrame(art,.5).core.alpha);
});
test('one bounded canvas replaces many DOM particles; no glyphs and target box',()=>{
 const node={children:[],append(n){this.children.push(n)}};
 const document={createElement:tag=>({tag,style:{},setAttribute(){}})};
 appendHeroImpactArt(document,node,'magic',true);assert.equal(node.children.length,1);assert.equal(node.children[0].tag,'canvas');
 const css=readFileSync(new URL('../public/hero-attack-effects.css',import.meta.url),'utf8');
 const contact=css.slice(css.indexOf('/* Approved v2:'));
 assert.match(contact,/::after\{content:none;display:none\}/);assert.match(contact,/primary-target\{outline:0;box-shadow:none!important\}/);
 assert.doesNotMatch(contact,/infinite|brightness\(|heroContactSweep|heroContactScatter/);
});
