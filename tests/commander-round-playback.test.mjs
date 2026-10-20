import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('round playback consumes server events in order and never calculates damage',()=>{
 const src=read('commander-round-playback.js');
 assert.match(src,/const fresh=events\.filter\(entry=>Number\.isSafeInteger\(entry\?\.version\)&&entry\.version>lastVersion\)/);
 assert.match(src,/for\(const entry of fresh\)/);
 assert.match(src,/heroarena:experimental-move/);
 assert.match(src,/heroarena:experimental-round-end/);
 assert.doesNotMatch(src,/\.hp\s*[-+*/]?=/);
});
test('2D and 3D renderers consume committed round snapshots',()=>{
 assert.match(read('battle-preview.js'),/heroarena:experimental-round-end/);
 assert.match(read('battle-preview.js'),/addEventListener\('heroarena:experimental-move'/);
 assert.match(read('battle-preview.js'),/animateMove\(\{\.\.\.move,actorId:move\.actor,targetId:move\.target\}\)/);
 assert.match(read('battle-preview.js'),/if\(auctionMode\)void showAuctionRematch\(\)/);
 assert.match(read('arena-three.js'),/heroarena:experimental-round-end/);
 assert.match(read('arena-three.js'),/heroarena:experimental-move/);
 assert.match(read('battle-preview.html'),/commander-round-playback\.js/);
});
