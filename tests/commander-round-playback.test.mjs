import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('queued playback deduplicates events and never overwrites authoritative health',async()=>{
 const received=[],handlers=new Map();
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:event=>received.push(event)};
 runInNewContext(read('commander-round-playback.js'),{window,document:{hidden:false},
 CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
 setTimeout:resolve=>{resolve();}});
 const teams=[[{id:'a',hp:100}],[{id:'b',hp:80}]];
 const emit=events=>handlers.get('heroarena:commander-round')({detail:{round:1,events,teams}});
 emit([{actor:'a',target:'b',version:1,value:20},{actor:'a',target:'b',version:2,value:10}]);
 emit([{actor:'a',target:'b',version:2,value:10},{actor:'commander:0',version:3},{actor:'b',target:'a',version:4,value:5}]);
 for(let i=0;i<30;i++)await Promise.resolve();
 assert.deepEqual(received.map(e=>e.detail.event.version),[1,2,4]);
 assert.ok(received.every(e=>e.type==='heroarena:experimental-move'));
 assert.equal(window.heroArenaTeams,undefined);
 assert.equal(teams[0][0].hp,100);assert.equal(teams[1][0].hp,80);
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
