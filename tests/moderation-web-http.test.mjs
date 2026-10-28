import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createServer} from 'node:net';
test('web moderation end-to-end: report receipts, block protections, admin isolation and CG exclusion',{timeout:20000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base='http://127.0.0.1:'+port;
 const post=async(path,body={},status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data};
 try{
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert.ok(ready,logs);
  for(const page of ['/','/battle-preview.html']){
   const html=await(await fetch(base+page)).text();assert.match(html,/src="\/moderation.js"/);
   assert.equal((html.match(/id="support-menu"/g)||[]).length,1);
   assert.match(html,/<details id="support-menu" class="support-menu">/);
   assert.match(html,/id="support-moderation"/);
  }
  for(const prefix of ['', '/crazygames'])for(const asset of ['/support-menu.js','/support-menu.css','/account-popover.js','/music-credits.html']){
   const response=await fetch(base+prefix+asset);assert.equal(response.status,200,prefix+asset);
   const text=await response.text();assert.ok(text.length>100,prefix+asset);
   if(asset==='/music-credits.html')for(const retained of ['HitCtrl','Kevin MacLeod','William Hector','CC BY 3.0','CC BY 4.0','Changes'])assert.ok(text.includes(retained),retained);
  }
  for(const page of ['/crazygames/','/crazygames/battle-preview.html'])assert.doesNotMatch(await(await fetch(base+page)).text(),/moderation\.(?:js|css)/);
  await post('/api/moderation/report',{},401);await post('/api/moderation/block',{},401);await post('/api/auth/guest',{name:'fuck'},400);
  const a=await post('/api/auth/guest',{name:'Alice'}),b=await post('/api/auth/guest',{name:'Bob'}),c=await post('/api/auth/guest',{name:'Cecil'});const aa={authToken:a.authToken},bb={authToken:b.authToken},cc={authToken:c.authToken};const aid=(await post('/api/friends',aa)).playerId,bid=(await post('/api/friends',bb)).playerId,cid=(await post('/api/friends',cc)).playerId;
  await post('/api/moderation/report',{...aa,playerId:cid,reason:'spam',context:{message:'forged evidence'}},403);
  await post('/api/friend/add',{...aa,playerId:bid});const receipt=await post('/api/moderation/report',{...bb,playerId:aid,reason:'harassment',details:'Please review'});assert.deepEqual(Object.keys(receipt).sort(),['createdAt','id','reason','status']);assert.equal((await post('/api/moderation/state',aa)).reports.length,0);await post('/api/admin/moderation/list',aa,403);await post('/api/admin/moderation/review',{...bb,reportId:receipt.id,status:'actioned',note:'fake admin'},403);
  await post('/api/moderation/block',{...bb,playerId:aid});await post('/api/friend/add',{...aa,playerId:bid},403);assert.equal((await post('/api/friends',aa)).outgoing.length,0);
  const room=await post('/api/create',aa);await post('/api/join',{...bb,code:room.room.code},403);assert.equal((await post('/api/wallet',aa)).gold,500);assert.equal((await post('/api/wallet',bb)).gold,500);
  await post('/api/moderation/unblock',{...bb,playerId:aid});const joined=await post('/api/join',{...bb,code:room.room.code});
  const ap={...aa,code:room.room.code,token:room.token},bp={...bb,code:room.room.code,token:joined.token};await post('/api/chat',{...ap,message:'Hello'});await post('/api/chat',{...bp,message:'fuck'},400);
  await post('/api/moderation/block',{...bb,playerId:aid});await post('/api/chat',{...ap,message:'Blocked message'},403);assert.equal((await post('/api/state',bp)).room.chat.length,0);await post('/api/rematch',ap,403);
  assert.equal((await post('/api/spectate',{...cc,code:room.room.code})).room.chat.length,0);assert.equal((await post('/api/wallet',aa)).gold,450);assert.equal((await post('/api/wallet',bb)).gold,450);
 }finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,2000).unref()})}
});
