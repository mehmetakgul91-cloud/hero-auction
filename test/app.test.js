import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {smtpOptions,validateDraft,imapOptions,archiveMessage,sentFolder} from '../mail.js';

const config={host:'smtp.example.test',port:587,user:'owner@example.test',fromName:'ENKA',production:false};
async function fixture(t,sendImpl=async()=>({accepted:['recipient@example.test']}),archiveImpl=async()=>({folder:'Sent'})){
  const calls=[],copies=[];
  const app=createApp(config,(_c,pass)=>({verify:async()=>{if(pass!==undefined&&pass!=='test-only-password')throw Object.assign(new Error('auth'),{code:'EAUTH'});},close(){},sendMail:async m=>{calls.push(m);return sendImpl(m);}}),async (...args)=>{copies.push(args);return archiveImpl(...args);});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  let cookie='',csrf='';
  async function request(path,body,headers={}){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,...headers},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json(),headers:r.headers};}
  async function login(){assert.equal((await request('/api/login',{account:config.user,password:'test-only-password'})).status,200);const s=await request('/api/session');csrf=s.data.csrf;return s;}
  const draft=()=>request('/api/drafts',{to:'recipient@example.test',subject:'Test subject',text:'Only the reviewed text'});
  return {request,login,draft,calls,copies,app};
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
  assert.equal((await a).data.state,'accepted');assert.equal(f.calls.length,1);assert.equal(f.calls[0].envelope.from,config.user);assert.deepEqual(f.calls[0].envelope.to,[d.to]);assert.match(f.calls[0].raw.toString(),/From: ENKA <owner@example.test>/);assert.match(f.calls[0].raw.toString(),/Only the reviewed text/);assert.equal(f.copies.length,1);assert.deepEqual(f.copies[0][3],f.calls[0].raw);
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

test('archive failure keeps SMTP accepted and retry only archives',async t=>{
  let n=0;const f=await fixture(t,undefined,async()=>{if(++n===1)throw new Error('IMAP unavailable');return {folder:'INBOX.Sent'};});
  await f.login();const {data:d}=await f.draft();const result=await f.request('/api/send',{id:d.id});
  assert.equal(result.data.state,'accepted');assert.equal(result.data.archiveState,'failed');assert.equal(f.calls.length,1);
  const retry=await f.request('/api/archive',{id:d.id});assert.equal(retry.data.archiveState,'saved');assert.equal(retry.data.archiveFolder,'INBOX.Sent');
  await f.request('/api/archive',{id:d.id});await f.request('/api/send',{id:d.id});assert.equal(f.calls.length,1);assert.equal(f.copies.length,2);
});
test('unknown SMTP outcomes never get archived as sent',async t=>{
  const f=await fixture(t,async()=>{throw Object.assign(new Error('lost reply'),{code:'ETIMEDOUT'});});await f.login();const {data:d}=await f.draft();
  await f.request('/api/send',{id:d.id});assert.equal(f.copies.length,0);assert.equal((await f.request('/api/archive',{id:d.id})).status,400);
});
test('import archives original receipts without sending and rejects malformed identity/date',async t=>{
  const f=await fixture(t);await f.login();
  const record={to:'a@example.test',subject:'Previous',text:'Original content',state:'accepted',sentAt:Date.now()-7200000,messageId:'<original-123@example.test>'};
  const body={account:config.user,record};const imported=await f.request('/api/import-receipt',body);assert.equal(imported.status,201);
  await f.request('/api/archive',{id:imported.data.id});assert.equal(f.calls.length,0);assert.equal(f.copies.length,1);
  assert.match(f.copies[0][3].toString(),/Message-ID: <original-123@example.test>/);
  const repeated=await f.request('/api/import-receipt',body);assert.equal(repeated.data.id,imported.data.id);
  for(const change of [{messageId:'bad\r\nBcc: victim@test.com'},{sentAt:Date.now()+3600000},{state:'unknown'},{messageId:'<id@other.test>'}]){
    assert.equal((await f.request('/api/import-receipt',{...body,record:{...record,...change}})).status,400);
  }
});
test('rolling-hour quota blocks the eleventh send and reports next availability',async t=>{
  const f=await fixture(t);await f.login();
  for(let i=0;i<10;i++){const {data:d}=await f.request('/api/drafts',{to:'recipient@example.test',subject:'Unique '+i,text:'Reviewed'});assert.equal((await f.request('/api/send',{id:d.id})).data.state,'accepted');}
  const {data:s}=await f.request('/api/session');assert.equal(s.quota.remaining,0);assert.ok(s.quota.nextAt>s.quota.serverNow);
  const {data:d}=await f.request('/api/drafts',{to:'recipient@example.test',subject:'Eleventh',text:'Reviewed'});assert.equal((await f.request('/api/send',{id:d.id})).status,429);assert.equal(f.calls.length,10);
});
test('IMAP uses verified TLS and only a unique Sent folder',()=>{
  const o=imapOptions(config,'test-only-password');assert.equal(o.secure,true);assert.equal(o.port,993);assert.equal(o.tls.rejectUnauthorized,true);assert.equal(o.logger,false);
  assert.equal(sentFolder([{path:'INBOX.Sent',specialUse:'\\Sent'}]),'INBOX.Sent');
  assert.throws(()=>sentFolder([{path:'Inbox',specialUse:'\\Inbox'}]));
  assert.throws(()=>sentFolder([{path:'Sent',specialUse:'\\Sent'},{path:'OtherSent',specialUse:'\\Sent'}]));
});
test('lost APPEND acknowledgement retries by Message-ID without duplicating the copy',async()=>{
  let exists=false,appends=0,locksReleased=0,logouts=0;
  const d={messageId:'<unique@example.test>',sentAt:Date.now()};
  const make=()=>({on(){},async connect(){},async list(){return [{path:'Sent',specialUse:'\\Sent'}];},
    async getMailboxLock(){return {release(){locksReleased++;}};},async search(q){assert.equal(q.header['Message-ID'],d.messageId);return exists?[42]:[];},
    async append(path,raw,flags,date){appends++;exists=true;assert.equal(path,'Sent');assert.deepEqual(flags,['\\Seen']);assert.equal(+date,d.sentAt);throw new Error('lost acknowledgement');},
    async logout(){logouts++;},close(){}});
  await assert.rejects(archiveMessage(config,'test-only-password',d,Buffer.from('message'),make));
  assert.deepEqual(await archiveMessage(config,'test-only-password',d,Buffer.from('message'),make),{folder:'Sent',existing:true});
  assert.equal(appends,1);assert.equal(locksReleased,2);assert.equal(logouts,2);
});
test('PDF attachment survives SMTP, Sent copy and export/import; changing upload cannot change preview',async t=>{
  const f=await fixture(t);await f.login();
  const bytes=Buffer.from('%PDF-1.4\nFixture presentation bytes\n%%EOF');
  const a=await f.request('/api/attachments',{filename:'ENKA.pdf',base64:bytes.toString('base64')});assert.equal(a.status,201);
  const d=await f.request('/api/drafts',{to:'recipient@example.test',subject:'Presentation',text:'See attached',attachmentId:a.data.id});
  await f.request('/api/attachments',{filename:'Other.pdf',base64:Buffer.from('%PDF-1.4\nOther deck\n%%EOF').toString('base64')});
  const sent=await f.request('/api/send',{id:d.data.id});assert.equal(sent.data.attachment.id,a.data.id);assert.equal(sent.data.archiveState,'saved');
  const raw=f.calls[0].raw.toString();assert.match(raw,/Content-Type: application\/pdf; name=ENKA.pdf/);assert.ok(raw.replace(/\r\n/g,'').includes(bytes.toString('base64')));assert.deepEqual(f.calls[0].raw,f.copies[0][3]);
  const exported=(await f.request('/api/export')).data;assert.equal(exported.attachmentFiles.length,1);assert.equal(exported.attachmentFiles[0].base64,bytes.toString('base64'));
  const g=await fixture(t);await g.login();const receipt=exported.records[0];
  assert.equal((await g.request('/api/import-receipt',{account:config.user,record:receipt})).status,400);
  const imported=await g.request('/api/import-receipt',{account:config.user,record:receipt,attachmentFile:exported.attachmentFiles[0]});assert.equal(imported.status,201);
  await g.request('/api/archive',{id:imported.data.id});assert.equal(g.calls.length,0);assert.ok(g.copies[0][3].toString().replace(/\r\n/g,'').includes(bytes.toString('base64')));
});
test('attachment rejects arbitrary paths, executable content and over-limit files',async t=>{
  const f=await fixture(t);await f.login();
  for(const a of [{filename:'../../secret.pdf',base64:'JVBERi0xLjQ='},{filename:'x.pdf',base64:Buffer.from('executable').toString('base64')},{filename:'x.pdf',base64:Buffer.alloc(5*1024*1024+1,65).toString('base64')},{filename:'x.pdf',base64:'abc*'}])assert.equal((await f.request('/api/attachments',a)).status,400);
});
