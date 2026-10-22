import http from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transport, validateDraft } from './mail.js';

const HOUR = 3600000;
const token = () => randomBytes(32).toString('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const safeCode = e => /^[A-Z0-9_]{1,60}$/.test(e.code || '') ? e.code : 'CONNECTION_FAILED';
export function createApp(config, makeTransport = transport) {
  if (!config.host || ![465,587].includes(config.port) || !config.user) throw new Error('SMTP configuration is required.');
  if (config.production && !/^https:\/\//.test(config.origin || '')) throw new Error('HTTPS origin is required.');
  const sessions = new Map(), attempts = new Map(), sends = [], fingerprints = new Map();
  let loginBusy = 0, smtpState = { ready: null, code: 'CHECKING' }, probeBusy;
  const cookieName = config.production ? '__Host-enka' : 'enka';
  const setCookie = (res, value, age = 6*3600) => res.setHeader('Set-Cookie', `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${config.production ? '; Secure' : ''}`);
  const clean = () => {
    const now = Date.now();
    for (const [id,s] of sessions) if (s.expires < now) { s.password = ''; sessions.delete(id); }
    for (const [id,a] of attempts) if (a.until < now) attempts.delete(id);
    for (const [id,d] of fingerprints) if (d.created < now-24*HOUR) fingerprints.delete(id);
    while (sends.length && sends[0] < now-HOUR) sends.shift();
  };
  const timer = setInterval(clean, 60000); timer.unref();
  const publicDraft = d => ({ id:d.id, to:d.to, subject:d.subject, text:d.text, state:d.state, created:d.created, sentAt:d.sentAt, messageId:d.messageId });
  function session(req) {
    const id = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const s = sessions.get(id); if (!s || s.expires < Date.now()) throw fail(401,'Oturum kapalı. Lütfen yeniden giriş yap.');
    return { id, s };
  }
  async function readBody(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415,'JSON gerekli.');
    let size=0; const chunks=[];
    for await (const chunk of req) { size += chunk.length; if (size > 65536) throw fail(413,'İstek çok büyük.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail(400,'İstek okunamadı.'); }
  }
  const json = (res,status,data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
  async function probe() {
    if (probeBusy) return probeBusy;
    probeBusy=(async()=>{
      const t=makeTransport(config);
      try { await t.verify(); smtpState={ready:true,code:'TLS_READY'}; }
      catch(e) { smtpState={ready:false,code:safeCode(e)}; console.info('smtp_probe', safeCode(e)); }
      finally { t.close(); }
      return smtpState;
    })();
    try { return await probeBusy; } finally { probeBusy=null; }
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    if(config.production) res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET' && path==='/healthz') return json(res,200,{ok:true});
      if(req.method==='GET' && ['/','/app.js','/style.css'].includes(path)) {
        const file=path==='/'?'index.html':path.slice(1);
        const data=await readFile(new URL('./public/'+file,import.meta.url));
        res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'); return res.end(data);
      }
      if(req.method==='GET' && path==='/api/status') return json(res,200,{account:config.user,fromName:config.fromName,smtp:smtpState});
      if(req.method==='GET' && path==='/api/session') {
        const {s}=session(req); return json(res,200,{account:config.user,csrf:s.csrf,expires:s.expires,drafts:[...s.drafts.values()].map(publicDraft)});
      }
      if(req.method!=='POST') throw fail(404,'Sayfa bulunamadı.');
      const origin=config.origin || `http://127.0.0.1:${server.address().port}`;
      if(req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site') throw fail(403,'İstek kaynağı doğrulanamadı.');
      if(path==='/api/login') {
        clean();
        const ip=req.socket.remoteAddress || 'unknown';
        // A global cap also protects the one configured mailbox behind reverse proxies.
        const a=attempts.get('global') || {count:0,until:Date.now()+15*60000};
        if(a.count>=8 || loginBusy>=2) throw fail(429,'Çok fazla giriş denemesi. 15 dakika sonra tekrar dene.');
        a.count++;attempts.set('global',a);
        const b=await readBody(req);
        if(typeof b.password!=='string' || b.password.length<1 || b.password.length>1024 || b.account!==config.user) throw fail(400,'Hesap bilgileri geçersiz.');
        const t=makeTransport(config,b.password); loginBusy++;
        try { await t.verify(); } catch(e) {
          throw fail(401,e.code==='EAUTH'?'Mail şifresi doğrulanamadı.':'Mail sunucusuna güvenli bağlantı kurulamadı.');
        } finally { loginBusy--;t.close(); }
        let previous;try {previous=session(req).id;}catch{}
        if(previous) {sessions.get(previous).password='';sessions.delete(previous);}
        if(sessions.size>=5) {b.password='';throw fail(429,'Açık oturum sınırına ulaşıldı.');}
        const id=token(), s={password:b.password,csrf:token(),expires:Date.now()+6*HOUR,drafts:new Map()}; b.password='';
        sessions.set(id,s);setCookie(res,id);return json(res,200,{ok:true});
      }
      const {id,s}=session(req);
      if(req.headers['x-csrf-token']!==s.csrf) throw fail(403,'Güvenlik doğrulaması geçersiz. Sayfayı yenile.');
      const b=await readBody(req);
      if(path==='/api/logout') {s.password='';sessions.delete(id);setCookie(res,'',0);return json(res,200,{ok:true});}
      if(path==='/api/drafts') {
        if(s.drafts.size>=100) throw fail(429,'Bu oturumun taslak sınırına ulaşıldı.');
        let data;try {data=validateDraft(b);}catch(e){throw fail(400,e.message);}
        const d={...data,id:randomUUID(),state:'draft',created:Date.now()};s.drafts.set(d.id,d);return json(res,201,publicDraft(d));
      }
      if(path==='/api/send') {
        const d=s.drafts.get(b.id);if(!d)throw fail(404,'Önizlenen taslak bulunamadı.');
        if(d.state!=='draft')return json(res,200,publicDraft(d));
        clean();
        const hash=createHash('sha256').update(JSON.stringify([d.to,d.subject,d.text])).digest('hex');
        if(fingerprints.has(hash))throw fail(409,'Bu mail için zaten gönderim denendi. Tekrar göndermeden önce alıcıyla durumu kontrol et.');
        if(sends.length>=10)throw fail(429,'Saatlik 10 mail sınırına ulaşıldı.');
        // Claim synchronously before awaiting SMTP: parallel clicks cannot send twice.
        d.state='sending';fingerprints.set(hash,d);sends.push(Date.now());
        d.messageId=`<${randomUUID()}@${config.user.split('@')[1]}>`;
        const t=makeTransport(config,s.password);
        try {
          const result=await t.sendMail({from:{name:config.fromName,address:config.user},to:d.to,subject:d.subject,text:d.text,messageId:d.messageId,
            envelope:{from:config.user,to:[d.to]},disableFileAccess:true,disableUrlAccess:true});
          d.state=result.accepted?.length===1?'accepted':'rejected';d.sentAt=Date.now();
        } catch(e) {
          // A lost SMTP response can mean delivery succeeded. Never automatically retry.
          d.state=(e.code==='EAUTH' || e.code==='EENVELOPE' || Number(e.responseCode)>=400)?'rejected':'unknown';
        } finally {t.close();}
        return json(res,200,publicDraft(d));
      }
      throw fail(404,'İşlem bulunamadı.');
    } catch(e) { if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'İşlem tamamlanamadı. Lütfen tekrar kontrol et.'});else res.end(); }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.on('close',()=>{clearInterval(timer);for(const s of sessions.values())s.password='';sessions.clear();});
  return {server,probe};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const config={host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),user:process.env.SMTP_USER,fromName:process.env.SMTP_FROM_NAME||'Mehmet AKGÜL · ENKA Plastik',production:process.env.NODE_ENV==='production',origin:process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL};
  const {server,probe}=createApp(config);
  server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>{console.info('ENKA mail service ready');void probe();});
  process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),25000).unref();});
}
