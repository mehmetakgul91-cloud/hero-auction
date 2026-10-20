import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/arena-three.js',import.meta.url),'utf8');
test('3D arena handles authoritative commander move events',()=>{
 assert.match(source,/const commanderVisual=e=>/);
 assert.match(source,/heroarena:move',commanderVisual/);
 assert.match(source,/commander-\(attack\|defense\|magic\|support\)/);
});
test('3D commander effects cover all four types and ultimate burst',()=>{
 for(const type of ['attack','defense','magic','support'])assert.match(source,new RegExp(type+':0x'));
 assert.match(source,/ability==='ultimate'\)spawnImpact/);
});
test('3D commander effects do not mutate winner or health',()=>{
 const start=source.indexOf('const commanderVisual=e=>');
 const end=source.indexOf("window.addEventListener('heroarena:move',commanderVisual)",start);
 const code=source.slice(start,end);
 assert.doesNotMatch(code,/\.hp\s*=|\.winner\s*=|\.energy\s*=/);
});
