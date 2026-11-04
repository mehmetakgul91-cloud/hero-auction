// Local-only visual QA for the shipped arena modules. Synthetic battle data;
// no database, accounts, external API proxy, or production mutations.
// Run: node tools/preview-class-effects.mjs, then http://127.0.0.1:3137/__effects
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {battleRoster,simulateRosterBattle} from '../battle-roster.js';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const cards=['original:09','original:07','original:01','original:15','original:13'].map(id=>({id,power:80}));
const fixture={...simulateRosterBattle(cards,cards,{seed:'class-choreography-qa'}),live:true,log:[]};
const clock=`<script>(()=>{let now=1793740000000,serial=0;const jobs=new Map();Date.now=()=>now;window.setTimeout=(fn,ms=0,...args)=>{jobs.set(++serial,{fn:()=>fn(...args),at:now+Math.max(0,Number(ms)||0)});return serial};window.clearTimeout=id=>jobs.delete(id);window.setInterval=(fn,ms=0)=>{const id=++serial;jobs.set(id,{fn,at:now+Math.max(1,ms),interval:Math.max(1,ms)});return id};window.clearInterval=window.clearTimeout;window.requestAnimationFrame=fn=>setTimeout(()=>fn(now),16);window.cancelAnimationFrame=window.clearTimeout;window.__visualClock={advance(ms){const end=now+ms;let count=0;while(++count<10000){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,j]=next;now=j.at;jobs.delete(id);if(j.interval)jobs.set(id,{...j,at:now+j.interval});j.fn()}now=end;if(count>=10000)throw Error('Visual clock budget exceeded')}}})();</script>`;
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(url.pathname==='/api/battle-preview'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(fixture));return;}
  if(url.pathname==='/api/art'){const hero=battleRoster.find(h=>h.name===url.searchParams.get('name'));res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({url:hero?.portrait||null}));return;}
  if(url.pathname.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'}).end('{}');return;}
  if(url.pathname==='/__effects'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(await readFile(new URL('./preview-class-effects.html',import.meta.url)));return;}
  const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!filename.startsWith(root)){res.writeHead(403).end();return;}
  let bytes=await readFile(filename);if(filename.endsWith('/battle-preview.html'))bytes=Buffer.from(bytes.toString().replace('<head>','<head>'+clock));
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data: blob: 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src 'self' data: blob:"}).end(bytes);
 }catch(e){res.writeHead(404).end('Not found');}
});
server.listen(3137,'127.0.0.1',()=>console.log('Class effects QA http://127.0.0.1:3137/__effects'));
