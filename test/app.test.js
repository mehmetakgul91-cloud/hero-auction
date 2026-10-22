import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {smtpOptions,validateDraft} from '../mail.js';

const config={host:'smtp.example.test',port:587,user:'owner@example.test',fromName:'ENKA',production:false};
async function fixture(t,sendImpl=async()=>({accepted:['recipient@example.test']})){
  const calls=[];
  const app=createApp(config,(_c,pass)=>({verify:async()=>{if(pass!==undefined&&pass!=='test-only-password')throw Object.assign(new Error('auth'),{code:'EAUTH'});},close(){},sendMail:async m=>{calls.push(m);return sendImpl(m);}}));
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  let cookie='',csrf='';
  async function request(path,body,headers={}){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,...headers},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json(),headers:r.headers};}
  async function login(){assert.equal((await request('/api/login',{account:config.user,password:'test-only-password'})).status,200);const s=await request('/api/session');csrf=s.data.csrf;return s;}
  const draft=()=>request('/api/drafts',{to:'recipient@example.test',subject:'Test subject',text:'Only the reviewed text'});
  return {request,login,draft,calls,app};
}
test('TLS is mandatory and credentials never change server or sender',()=>{
  const o=smtpOptions(config,'test-only-password');assert.equal(o.requireTLS,true);assert.equal(o.opportunisticTLS,false);assert.equal(o.tls.rejectUnauthorized,true);assert.equal(o.tls.minVersion,'TLSv1.2');assert.equal(o.disableFileAccess,true);assert.equal(o.disableUrlAccess,true);assert.equal(o.secure,false);assert.equal(smtpOptions({...config,port:465}).secure,true);
});
test('rejects recipient lists, header injection, empty text and oversized content',()=>{
  const good={to:'a@example.com',subject:'Hello',text:'Message'};
  for(const bad of [{to:'a@example.com,b@example.com'},{to:'a@example.com\r\nBcc:b@example.com'},{subject:'Hi\nBcc: a@example.com'},{text:''},{text:'x'.repeat(20001)}])assert.throws(()=>validateDraft({...good,...bad}));
  assert.equal(validateDraft(good).to,'a@example.com');
});
test('private endpoints require login, correct origin and CSRF',async t=>{
  const f=await fixture(t);assert.equal((await f.request('/api/session')).status,401);assert.equal((await f.request('/api/send',{id:'x'})).status,401);
  assert.equal((await f.request('/api/login',{account:config.user,password:'test-only-password'},{Origin:'https://evil.test'})).status,403);
  const s=await f.login();assert.equal(JSON.stringify(s.data).includes('test-only-password'),false);
  assert.equal((await f.request('/api/send',{id:'x'},{'X-CSRF-Token':'bad'})).status,403);
  assert.equal((await f.request('/api/send',{id:'x'})).status,404);assert.equal(f.calls.length,0);
});
test('login verifies the fixed account; attempts are bounded',async t=>{
  const f=await fixture(t);
  for(let i=0;i<8;i++)assert.equal((await f.request('/api/login',{account:config.user,password:'wrong'})).status,401);
  assert.equal((await f.request('/api/login',{account:config.user,password:'test-only-password'})).status,429);
});
test('concurrent send clicks send only the immutable preview with fixed From',async t=>{
  let finish;const pending=new Promise(resolve=>finish=resolve);const f=await fixture(t,()=>pending);await f.login();const {data:d}=await f.draft();assert.equal(f.calls.length,0);
  const a=f.request('/api/send',{id:d.id,to:'attacker@example.test',text:'Changed',from:'fake@example.test'});
  await new Promise(resolve=>setTimeout(resolve,30));
  const b=await f.request('/api/send',{id:d.id});assert.equal(b.data.state,'sending');finish({accepted:['recipient@example.test']});
  assert.equal((await a).data.state,'accepted');assert.equal(f.calls.length,1);assert.equal(f.calls[0].from.address,config.user);assert.equal(f.calls[0].to,d.to);assert.equal(f.calls[0].text,d.text);
  assert.equal((await f.request('/api/send',{id:d.id})).data.state,'accepted');assert.equal(f.calls.length,1);
  const duplicate=await f.draft();assert.equal((await f.request('/api/send',{id:duplicate.data.id})).status,409);
});
test('ambiguous SMTP errors remain unknown and cannot be retried',async t=>{
  const f=await fixture(t,async()=>{throw Object.assign(new Error('response lost'),{code:'ETIMEDOUT'});});await f.login();const {data:d}=await f.draft();
  assert.equal((await f.request('/api/send',{id:d.id})).data.state,'unknown');
  assert.equal((await f.request('/api/send',{id:d.id})).data.state,'unknown');assert.equal(f.calls.length,1);
});
test('SMTP rejection is not reported as delivered',async t=>{
  const f=await fixture(t,async()=>{throw Object.assign(new Error('rejected'),{responseCode:550});});await f.login();const {data:d}=await f.draft();assert.equal((await f.request('/api/send',{id:d.id})).data.state,'rejected');
});
test('logout revokes the session, health stays public and contains no account secrets',async t=>{
  const f=await fixture(t);await f.login();assert.equal((await f.request('/api/logout',{})).status,200);assert.equal((await f.request('/api/session')).status,401);assert.deepEqual((await f.request('/healthz')).data,{ok:true});
});
