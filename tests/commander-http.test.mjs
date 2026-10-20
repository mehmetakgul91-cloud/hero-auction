import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

function freePort(){return new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})}
async function withServer(enabled,run){
 const port=await freePort();
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),EXPERIMENTAL_COMMANDER_TURNS:enabled?'1':'0',DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
 let logs='';
 child.stdout.on('data',b=>{logs+=b.toString()});
 child.stderr.on('data',b=>{logs+=b.toString()});
 try{
  let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('Server exited: '+logs);
   try{const res=await fetch('http://127.0.0.1:'+port+'/api/experimental/commander-turn');if(res.status){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw Error('Server startup timed out: '+logs);
  await run('http://127.0.0.1:'+port);
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()});
 }
}
test('experimental commander endpoint disabled by default',async()=>{
 await withServer(false,async base=>{
  const response=await fetch(base+'/api/experimental/commander-turn?code=123&token=fake');
  assert.equal(response.status,404);
  assert.match((await response.json()).error,/disabled/);
 });
});
test('enabled endpoint rejects an unknown room',async()=>{
 await withServer(true,async base=>{
  const response=await fetch(base+'/api/experimental/commander-turn?code=123&token=fake');
  assert.equal(response.status,403);
 });
});
test('enabled endpoint rejects unauthorized POST commands',async()=>{
 await withServer(true,async base=>{
  const response=await fetch(base+'/api/experimental/commander-turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'123',token:'fake',round:1,command:'ultimate'})});
  assert.equal(response.status,403);
 });
});
