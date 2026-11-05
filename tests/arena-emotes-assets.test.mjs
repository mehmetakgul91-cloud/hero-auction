import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {ARENA_EMOTES} from '../public/arena-emotes.js';
const root=new URL('../public/images/arena-emotes/',import.meta.url);
test('every approved face has bounded one-shot animation and a reduced-motion still',()=>{
 const expected=ARENA_EMOTES.flatMap(({id})=>[id+'.webp',id+'.png']).sort();
 assert.deepEqual(readdirSync(root).sort(),expected);
 for(const {id} of ARENA_EMOTES){
  const png=readFileSync(new URL(id+'.png',root));assert.equal(png.toString('ascii',1,4),'PNG');assert.equal(png.readUInt32BE(16),188);assert.equal(png.readUInt32BE(20),188);
  const webp=readFileSync(new URL(id+'.webp',root));assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');assert.ok(webp.length<150000);
  let duration=0,frames=0,loops=null;
  for(let offset=12;offset+8<=webp.length;){
   const type=webp.toString('ascii',offset,offset+4),size=webp.readUInt32LE(offset+4),data=offset+8;assert.ok(data+size<=webp.length);
   if(type==='ANIM')loops=webp.readUInt16LE(data+4);
   if(type==='ANMF'){frames++;duration+=webp.readUIntLE(data+12,3);}
   offset=data+size+(size%2);
  }
  assert.ok(frames>=4,id+' has real changing animation frames');assert.equal(duration,2800);assert.equal(loops,1);
 }
});
