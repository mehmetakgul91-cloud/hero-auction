import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ARENA_EMOTES} from '../public/arena-emotes.js';
const root=new URL('../public/images/arena-emotes/',import.meta.url);
// Approved 188px artwork: animation hashes omit only the three ANMF duration
// bytes. Pixel payloads, canvas, frame layout, metadata and one-shot loops stay fixed.
const approvedAssets={
 fake_cry:{animation:'1f27d6a0740554f1f716ef2361e4feeb067b02fbadeefa4b3b43642cbf73d832',still:'88f31d9e064524ff5ecb14bd8ae3b664cf87bef9aeebc98cd3921e82c8122644',durations:[50,50,100,50,50,100,50,50,50,100,100,150,150,100,150,300,200,1000]},
 laugh:{animation:'81dadd288c965927c4a01ed5783fad582c093de91af7f7462325daac1bd4356a',still:'e0bc52bed341635aef33dcbf3304eca08e82a58add5bf26423b2bd6b13d2d625',durations:[100,150,50,50,50,50,50,50,100,50,50,150,100,100,50,50,150,50,150,50,50,100,50,50,50,100,50,50,50,50,50,250,100,100,100]},
 nanik:{animation:'f9f22158ccd47e9c1cb8945c0b48c658d6f55fbb66a6757171814840c6112ebc',still:'064b7759b400d056f5408f1c44aa9701d90b0dc0b8225877be27ce8c891f8af7',durations:[400,500,400,400,400,400,300]},
 slow_clap:{animation:'289f881caf6a57b725391061fad8e4e69fdd9d3f2c7db6ed9001df61cac3b756',still:'eedb58965110af2e7919c1032f7cd3c8abaa6ed7db01d8b7a24b89bdd0a68464',durations:[50,150,50,150,50,50,50,50,50,50,50,50,100,50,50,100,150,50,150,150,100,100,50,50,50,100,50,50,50,100,50,100,50,150,50,50,50]},
 sunglasses:{animation:'d5f31733f895831a878ae1a2c7930f6789836bce1176963ecee54677b666e737',still:'a7da889c09c77c9ab04a3e8bfe94fe1ac6050e7197ff2359055182522b4390a1',durations:[50,150,100,50,150,50,250,50,50,100,100,150,50,50,50,50,200,100,150,200,50,50,600]},
 yawn:{animation:'d726764f74fc2d8b7ea9adb8dd234d9b9f61a96192e4145efad885043bdc62ca',still:'8685bf2a8534d982d332fc04b1bc84d7c24c4e843cc6731666708fdf54ea75d1',durations:[50,150,50,50,50,50,50,50,350,300,150,100,50,100,50,50,100,100,350,50,50,150,350]}
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('every approved face has bounded one-shot animation and a reduced-motion still',()=>{
 const expected=ARENA_EMOTES.flatMap(({id})=>[id+'.webp',id+'.png']).sort();
 assert.deepEqual(readdirSync(root).sort(),expected);
 for(const {id} of ARENA_EMOTES){
  const png=readFileSync(new URL(id+'.png',root));assert.equal(png.toString('ascii',1,4),'PNG');assert.equal(png.readUInt32BE(16),188);assert.equal(png.readUInt32BE(20),188);
  assert.equal(hash(png),approvedAssets[id].still,id+' reduced-motion artwork is unchanged');
  const webp=readFileSync(new URL(id+'.webp',root));assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');assert.ok(webp.length<150000);
  const artwork=Buffer.from(webp),durations=[];
  let duration=0,frames=0,loops=null;
  for(let offset=12;offset+8<=webp.length;){
   const type=webp.toString('ascii',offset,offset+4),size=webp.readUInt32LE(offset+4),data=offset+8;assert.ok(data+size<=webp.length);
   if(type==='VP8X'){assert.equal(webp.readUIntLE(data+4,3)+1,188);assert.equal(webp.readUIntLE(data+7,3)+1,188)}
   if(type==='ANIM')loops=webp.readUInt16LE(data+4);
   if(type==='ANMF'){frames++;const frameDuration=webp.readUIntLE(data+12,3);duration+=frameDuration;durations.push(frameDuration);artwork.fill(0,data+12,data+15)}
   offset=data+size+(size%2);
  }
  assert.ok(frames>=4,id+' has real changing animation frames');assert.equal(duration,5000);assert.equal(loops,1);
  assert.equal(hash(artwork),approvedAssets[id].animation,id+' preserves every non-duration byte');
  let oldElapsed=0,newElapsed=0;
  const proportionalDurations=approvedAssets[id].durations.map(original=>{oldElapsed+=original;const boundary=Math.round(oldElapsed*5000/2800),scaled=boundary-newElapsed;newElapsed=boundary;return scaled});
  assert.deepEqual(durations,proportionalDurations,id+' stretches the original animation timing proportionally to five seconds');
 }
});
