import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createArenaPlaylist} from '../public/arena-playlist.js';
import {createArenaAudio} from '../public/arena-audio.js';
import {ARENA_TRACKS} from '../public/arena-music-tracks.js';
import {crazyGamesSource} from '../crazygames-build.js';

const tracks=Array.from({length:6},(_,i)=>({id:'track-'+i,src:'/audio/'+i+'.mp3'}));
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('six unique tracks in each persisted shuffle cycle, no boundary repeat, stable on refresh',()=>{
 const saved=storage();let randomCalls=0,playlist=createArenaPlaylist(tracks,{storage:saved,random:()=>{randomCalls++;return .4}}),last=null;
 for(let cycle=0;cycle<15;cycle++){
  const heard=[];
  for(let i=0;i<6;i++){
   const key='match-'+(cycle*6+i),chosen=playlist.select(key),calls=randomCalls;
   assert.notEqual(chosen.id,last);heard.push(chosen.id);last=chosen.id;
   assert.equal(playlist.select(key),chosen);assert.equal(randomCalls,calls);
   playlist=createArenaPlaylist(tracks,{storage:saved,random:()=>{randomCalls++;return .4}});
   assert.equal(playlist.select(key).id,chosen.id);assert.equal(randomCalls,calls);
  }
  assert.equal(new Set(heard).size,6);
 }
});
test('silent preparation reserves a track without consuming it; activation consumes exactly once',()=>{
 const saved=storage(),playlist=createArenaPlaylist(tracks,{storage:saved,random:()=>0});
 const reserved=playlist.select('abandoned',{activate:false});
 for(let i=0;i<20;i++)assert.equal(playlist.select('prep-'+i,{activate:false}),reserved);
 assert.equal(playlist.select('actual-match'),reserved);
 assert.equal(playlist.select('actual-match'),reserved);
 assert.notEqual(playlist.select('rematch'),reserved);
});
test('blocked, corrupt or obsolete storage and bad RNG cannot block playback',()=>{
 for(const saved of [undefined,{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},{getItem:()=>'{broken',setItem(){}},{getItem:()=>JSON.stringify({signature:'old',remaining:[]}),setItem(){}}]){
  const playlist=createArenaPlaylist(tracks,{storage:saved,random:()=>NaN});
  assert.equal(new Set(Array.from({length:6},(_,i)=>playlist.select('match-'+i).id)).size,6);
 }
 assert.throws(()=>createArenaPlaylist([]));assert.throws(()=>createArenaPlaylist([tracks[0],tracks[0]]));
 assert.equal(createArenaPlaylist([tracks[0]]).select('only').id,tracks[0].id);
});

class FakeAudio{
 listeners=new Map();paused=true;error=null;plays=[];loads=0;pauses=0;src='';
 play(){this.plays.push(this.src);this.paused=false;return this.nextPlay?this.nextPlay():Promise.resolve()}
 pause(){this.pauses++;this.paused=true}
 load(){this.loads++;this.error=null}
 removeAttribute(name){if(name==='src')this.src=''}
 addEventListener(name,fn){this.listeners.set(name,fn)}
 removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name)}
 emit(name){this.listeners.get(name)?.()}
}
function fixture(){
 const audio=new FakeAudio(),timers=new Map();let next=0,active=true,prime=true,procedural=0,stops=0;
 const player=createArenaAudio({audio,canPlay:()=>active,canPrime:()=>prime,fallbackSrc:'/old.mp3',startProcedural:()=>procedural++,stopProcedural:()=>stops++,setTimer:fn=>{timers.set(++next,fn);return next},clearTimer:id=>timers.delete(id)});
 return {audio,player,timers,setActive:value=>active=value,setPrime:value=>prime=value,procedural:()=>procedural,stops:()=>stops,timeout(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn()}};
}
test('only the selected element loads lazily; gesture play is synchronous and priming is guaranteed muted',async()=>{
 const h=fixture();h.player.setTrack(tracks[0]);assert.equal(h.audio.src,'');assert.deepEqual(h.audio.plays,[]);
 const priming=h.player.prime();assert.deepEqual(h.audio.plays,[tracks[0].src]);assert.equal(h.audio.muted,true);assert.equal(h.audio.volume,0);
 await priming;const revealing=h.player.play();assert.equal(h.audio.muted,false);assert.equal(h.audio.volume,.60);await revealing;
 assert.equal(h.audio.loop,true);assert.equal(h.audio.preload,'none');assert.equal(h.timers.size,0);
 h.audio.currentTime=12;h.player.stop();await h.player.play();assert.equal(h.audio.currentTime,12);assert.equal(h.player.track,tracks[0]);
});
test('autoplay rejection preserves selection and retries on next tap, not fallback or another random track',async()=>{
 const h=fixture();h.player.setTrack(tracks[1]);h.audio.nextPlay=()=>Promise.reject(Object.assign(Error('gesture required'),{name:'NotAllowedError'}));
 await h.player.play();assert.deepEqual(h.audio.plays,[tracks[1].src]);assert.equal(h.procedural(),0);assert.equal(h.timers.size,0);
 h.audio.nextPlay=null;await h.player.play();assert.deepEqual(h.audio.plays,[tracks[1].src,tracks[1].src]);
});
test('real load failures are bounded to the old track then procedural fallback, never all six assets',async()=>{
 const h=fixture();h.player.setTrack(tracks[2]);h.audio.nextPlay=()=>Promise.reject(Object.assign(Error('missing'),{name:'NotSupportedError'}));
 await h.player.play();await flush();assert.deepEqual(h.audio.plays,[tracks[2].src,'/old.mp3']);assert.equal(h.procedural(),1);assert.equal(h.timers.size,0);
 h.player.stop();await h.player.play();assert.equal(h.audio.plays.length,2);assert.equal(h.procedural(),2);
});
test('error events, pending promises and stalled streams cannot duplicate fallback attempts',async()=>{
 const h=fixture();h.player.setTrack(tracks[3]);let reject;h.audio.nextPlay=()=>new Promise((_,r)=>reject=r);
 void h.player.play();const rejectPrimary=reject;h.audio.error={code:4};h.audio.emit('error');
 rejectPrimary(Object.assign(Error('missing'),{name:'NotSupportedError'}));await flush();assert.deepEqual(h.audio.plays,[tracks[3].src,'/old.mp3']);
 for(let i=0;i<10;i++)h.audio.emit('stalled');assert.equal(h.timers.size,1);
 h.timeout();assert.equal(h.procedural(),1);assert.equal(h.audio.plays.length,2);assert.equal(h.timers.size,0);
});
test('mute/background/finish invalidate late promises; newer playback is never paused by stale completion',async()=>{
 const h=fixture();h.player.setTrack(tracks[4]);let resolveOld;h.audio.nextPlay=()=>new Promise(r=>resolveOld=r);void h.player.play();
 h.setActive(false);h.player.stop();assert.equal(h.audio.paused,true);assert.equal(h.timers.size,0);
 h.setActive(true);h.audio.nextPlay=null;await h.player.play();const pauses=h.audio.pauses;
 resolveOld();await flush();assert.equal(h.audio.pauses,pauses);assert.equal(h.audio.paused,false);
 h.setActive(false);h.player.release();assert.equal(h.audio.src,'');assert.equal(h.audio.paused,true);await h.player.play();assert.equal(h.audio.src,'');
 h.player.destroy();assert.equal(h.audio.listeners.size,0);assert.equal(h.timers.size,0);
});
test('re-playing a stalled stream replaces the old watchdog with a live bounded fallback',async()=>{
 const h=fixture();h.player.setTrack(tracks[0]);await h.player.play();h.audio.emit('waiting');assert.equal(h.timers.size,1);
 h.audio.nextPlay=()=>new Promise(()=>{});void h.player.play();assert.equal(h.timers.size,1);
 h.timeout();assert.deepEqual(h.audio.plays,[tracks[0].src,tracks[0].src,'/old.mp3']);
 h.timeout();assert.equal(h.procedural(),1);assert.equal(h.timers.size,0);
});
test('changing match releases the previous media, resets fallback and never reassigns the same track on resume',async()=>{
 const h=fixture();h.player.setTrack(tracks[0]);await h.player.play();const loads=h.audio.loads;
 h.player.setTrack(tracks[0]);assert.equal(h.audio.loads,loads);h.player.setTrack(tracks[1]);assert.equal(h.audio.src,'');await h.player.play();assert.equal(h.audio.src,tracks[1].src);
});
test('first TEST manifest contains three distinct uploaded assets, no Latin or unlicensed artist recordings; hashes and credits match',()=>{
 const provenance=JSON.parse(readFileSync(new URL('../docs/arena-music-provenance.json',import.meta.url)));
 assert.deepEqual(ARENA_TRACKS.map(t=>t.id).sort(),['atlas-kazakhstan','determined-pursuit','eternal-sands']);
 assert.equal(provenance.tracks.length,3);
 const credits=readFileSync(new URL('../public/music-credits.html',import.meta.url),'utf8');
 assert.equal((credits.match(/<li>/g)||[]).length,3);
 for(const track of ARENA_TRACKS)assert.ok(credits.includes(track.title));
 assert.ok(!ARENA_TRACKS.some(t=>/latin|fupi|hassak|ulytau/i.test(JSON.stringify(t))));
 for(const track of ARENA_TRACKS){
  const evidence=provenance.tracks.find(t=>t.id===track.id),bytes=readFileSync(new URL('../public'+track.src,import.meta.url));
  assert.equal(bytes.length,evidence.game_asset_bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.game_asset_sha256);
  assert.ok(bytes.length<3*1024*1024);assert.equal(track.license,evidence.license);assert.equal(track.page,evidence.page);
 }
 assert.equal(provenance.tracks.find(t=>t.id==='atlas-kazakhstan').standalone_redistribution,false);
 assert.equal(provenance.tracks.find(t=>t.id==='atlas-kazakhstan').ai_generated,true);
});
test('browser integration keeps platform mute, visibility, page teardown, authoritative match IDs and separate portal storage',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 assert.match(source,/preparationMatchKey\?'auction:'\+auctionCode\+':\'\+preparationMatchKey/);
 assert.match(source,/hero:platform-settings/);assert.match(source,/document.hidden/);assert.match(source,/arenaMusic.destroy\(\)/);
 assert.match(source,/selectArenaMusic\(false\)/);assert.match(source,/selectArenaMusic\(true\)/);
 const playlist=readFileSync(new URL('../public/arena-playlist.js',import.meta.url),'utf8');
 assert.match(crazyGamesSource(playlist,'.js'),/hero-auction-cg-arena-playlist/);
 assert.match(crazyGamesSource(source,'.js'),/hero-auction-cg-arena-audio-enabled/);
 assert.match(crazyGamesSource(source,'.js'),/from '\/crazygames\/arena-music-tracks.js'/);
});

test('three-track release completes shuffle cycles without repeats and migrates six-track storage',()=>{
 const saved=storage();createArenaPlaylist(tracks,{storage:saved}).select('old-match');
 let playlist=createArenaPlaylist(ARENA_TRACKS,{storage:saved,random:()=>.4}),last=null;
 for(let cycle=0;cycle<10;cycle++){
  const heard=[];
  for(let i=0;i<3;i++){
   const key='release-'+cycle+'-'+i,chosen=playlist.select(key);
   assert.notEqual(chosen.id,last);last=chosen.id;heard.push(chosen.id);
   playlist=createArenaPlaylist(ARENA_TRACKS,{storage:saved,random:()=>.4});
   assert.equal(playlist.select(key).id,chosen.id);
  }
  assert.equal(new Set(heard).size,3);
 }
});
