import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('experimental cooldown UI fetches server-owned remaining time',()=>{
 const src=read('commander-live-cooldown.js');
 assert.match(src,/api\/experimental\/commander-live/);
 assert.match(src,/data\.cooldownMs/);
 assert.match(src,/Math\.ceil/);
 assert.match(src,/visibilitychange/);
});
test('cooldown preview is explicitly non-interactive until combat integration',()=>{
 const src=read('commander-live-cooldown.js');
 assert.doesNotMatch(src,/method:\s*'POST'/);
 assert.match(src,/savaş motoru bağlantısını bekliyor/);
 assert.match(read('battle-preview.html'),/commander-live-cooldown\.js/);
});
