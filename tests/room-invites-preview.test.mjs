import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
test('offline invitation preview embeds actual controllers, blocks real networking and has self-contained assets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'invite-preview-test-'));try{
  const output=path.join(dir,'preview.html');execFileSync(process.execPath,['tools/preview-room-invites.mjs',output]);const html=fs.readFileSync(output,'utf8');
  assert.ok(html.includes("connect-src 'none'"));assert.match(html,/const server=async/);assert.match(html,/fetch:server/);assert.match(html,/function createRoomInvitesUI/);assert.match(html,/function createFriendsUI/);assert.match(html,/commander-command-tree/);assert.ok(!/(?:src|href)="(?!data:)[^"]+"/.test(html));
  assert.match(html,/value="match"/);assert.match(html,/value="queued"/);assert.match(html,/value="send"/);assert.match(html,/value="multiple"/);assert.match(html,/value="failed"/);
  for(const mode of ['heroes','hero-detail','friends-invite','friend-requests'])assert.ok(html.includes('value="'+mode+'"'));assert.match(html,/function portalRoomInvites/);assert.match(html,/MutationObserver:window.MutationObserver/);assert.match(html,/hero-story-dialog/);assert.match(html,/\.room-invites\{position:fixed;/);assert.match(html,/friends-tools/);
  for(const [i,match] of [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].entries()){const script=path.join(dir,i+'.mjs');fs.writeFileSync(script,match[1]);execFileSync(process.execPath,['--check',script]);}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
