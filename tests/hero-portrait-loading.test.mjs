import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
const portraitSource=source.slice(source.indexOf('function heroPortrait('),source.indexOf('const query=',source.indexOf('function heroPortrait(')));
function harness({fail=false,url='/images/hero.png',connected=true}={}){
 const images=[];
 class Element {
  children=[];parent=null;isConnected=connected;classes=new Set();
  classList={toggle:(name,value)=>value?this.classes.add(name):this.classes.delete(name)};
  append(child){child.parent=this;this.children.push(child)}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null}
 }
 class Image extends Element {
  naturalWidth=120;naturalHeight=80;
  set src(value){
   this.url=value;
   // A detached lazy image has no layout intersection and does not request bytes.
   if(this.loading==='lazy'&&!this.parent)return;
   this.requested=true;
   // Cached completion can occur immediately: handlers must already be registered.
   if(fail)this.onerror?.();else this.onload?.();
  }
 }
 const context={document:{createElement:tag=>{if(tag!=='img')return new Element();const image=new Image();images.push(image);return image}},demoA:Array.from({length:5},(_,i)=>['Hero '+i]),loadHeroArt:async()=>url};
 runInNewContext(`${portraitSource};this.paint=heroPortrait;`,context);
 return {images,paint:context.paint,container:()=>new Element()};
}

test('all five detached preparation portraits load eagerly and replace initials, including cached completion',async()=>{
 const h=harness(),containers=Array.from({length:5},()=>h.container());
 containers.forEach((container,i)=>h.paint(i,container));await Promise.resolve();
 assert.equal(h.images.length,5);
 for(let i=0;i<5;i++){
  const image=h.images[i];assert.equal(image.loading,'eager');assert.equal(image.requested,true);
  assert.equal(containers[i].children.length,1);assert.equal(containers[i].children[0],image);
  assert.equal(image.alt,'Hero '+i);assert.ok(image.classes.has('hero-portrait-wide'));
 }
});

test('failed or missing portrait keeps its fallback without attaching a broken image',async()=>{
 for(const options of [{fail:true},{url:null}]){
  const h=harness(options),container=h.container();h.paint(0,container);await Promise.resolve();
  assert.equal(container.children.length,1);assert.equal(container.children[0].className,'portrait-fallback');
 }
});

test('removed hero cards do not attach stale async images',async()=>{
 const h=harness(),container=h.container();h.paint(0,container);container.isConnected=false;await Promise.resolve();
 assert.equal(h.images[0].requested,undefined);assert.equal(container.children[0].className,'portrait-fallback');
});
