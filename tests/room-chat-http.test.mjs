import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRoomChat} from '../public/room-chat.js';
class Element extends EventTarget{
 value='';disabled=false;hidden=false;scrollTop=0;scrollHeight=300;clientHeight=180;innerHTML='';
 setAttribute(){}focus(){}blur(){}
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('standalone HTTP app serves both entrypoints; composer sends, reloads and retains failed drafts',{timeout:20000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port,child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1',HERO_VICTORY_CHESTS_ENABLED:'0',HERO_DIAMONDS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
 let api;
 try{
  let ready=false;for(let n=0;n<120;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await delay(30)}assert.ok(ready,logs);
  for(const prefix of ['/','/crazygames/']){
   const html=await(await fetch(base+prefix)).text();assert.match(html,/<form class="chat-compose"/);assert.match(html,/<button type="submit" class="primary" id="chat-send"/);
   const source=await(await fetch(base+prefix+'app.js')).text();assert.ok(source.includes(`from '${prefix}room-chat.js'`));assert.ok(source.includes(`from '${prefix}auction-entry.js'`));
   for(const module of ['room-chat.js','auction-entry.js'])assert.equal((await fetch(base+prefix+module)).status,200);
  }
  const a=await post('/api/auth/guest',{name:'Composer A'}),b=await post('/api/auth/guest',{name:'Composer B'});
  const created=await post('/api/create',{authToken:a.authToken}),code=created.room.code;
  const joined=await post('/api/join',{authToken:b.authToken,code});
  const seat={authToken:a.authToken,code,token:created.token};
  let room=(await post('/api/state',seat)).room;assert.equal(room.phase,'auction');
  const nodes=Object.fromEntries(['form','input','button','panel','list'].map(k=>[k,new Element()])),errors=[];
  let settled=Promise.resolve();
  api=createRoomChat({document:{activeElement:null},...nodes,getContext:()=>({session:{code,token:created.token},room,authToken:a.authToken}),post:(path,body)=>{settled=post(path,{...body,authToken:a.authToken});return settled;},onRoom:next=>{room=next;api.update();},notify:error=>errors.push(error),escape:String});
  api.update();nodes.input.value='Merhaba arenadan';nodes.form.dispatchEvent(new Event('submit',{cancelable:true}));await settled;await delay(0);
  assert.equal(nodes.input.value,'');assert.equal(nodes.button.disabled,false);assert.match(nodes.list.innerHTML,/Merhaba arenadan/);
  const opponent=(await post('/api/state',{authToken:b.authToken,code,token:joined.token})).room;assert.equal(opponent.chat.at(-1).message,'Merhaba arenadan');
  room=(await post('/api/state',seat)).room;api.update();assert.match(nodes.list.innerHTML,/Merhaba arenadan/);
  nodes.input.value='x'.repeat(241);nodes.form.dispatchEvent(new Event('submit',{cancelable:true}));await settled.catch(()=>{});await delay(0);
  assert.equal(nodes.input.value.length,241);assert.equal(nodes.button.disabled,false);assert.equal(errors.length,1);
  assert.equal((await post('/api/state',seat)).room.chat.length,1,'server rejects invalid message without losing accepted history');
 }finally{api?.destroy();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()});}
});
