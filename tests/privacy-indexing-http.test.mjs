import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

async function freePort(){
 const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}

test('privacy aliases stay accessible but not indexable; homepage remains indexable',{timeout:20000},async()=>{
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 try{
  let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error(logs);
   try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'server did not start: '+logs);
  for(const path of ['/privacy','/privacy.html','/crazygames/privacy','/crazygames/privacy.html']){
   const response=await fetch(base+path,{redirect:'manual'});
   assert.equal(response.status,200,path);
   assert.match(response.headers.get('content-type'),/text\/html/);
   const html=await response.text();
   const head=html.match(/<head>([\s\S]*?)<\/head>/i)?.[1]||'';
   assert.match(head,/<meta name="robots" content="noindex,follow">/,path);
   assert.equal((head.match(/name="robots"/g)||[]).length,1,path);
   assert.match(html,/<h1>Hero Auction Gizlilik Politikası<\/h1>/);
   const home=path.startsWith('/crazygames/')?'/crazygames/':'/';
   assert.ok(html.includes(`<a href="${home}">← Hero Auction'a dön</a>`),path);
   assert.doesNotMatch(head,/rel="canonical"|http-equiv="refresh"/i);
  }
  const homeResponse=await fetch(base+'/',{redirect:'manual'});
  assert.equal(homeResponse.status,200);
  assert.doesNotMatch(homeResponse.headers.get('x-robots-tag')||'',/noindex/i);
  const home=await homeResponse.text();
  assert.match(home,/<meta name="robots" content="index,follow,max-image-preview:large">/);
  assert.match(home,/<link rel="canonical" href="https:\/\/heroauction\.com\.tr\/">/);
  assert.match(home,/href="\/privacy"/);
  const robotsResponse=await fetch(base+'/robots.txt');
  assert.equal(robotsResponse.status,200);
  const robots=await robotsResponse.text();
  assert.match(robots,/User-agent: \*\s+Allow: \//);
  assert.doesNotMatch(robots,/^Disallow:\s*\S/im,'Google must crawl privacy to see noindex');
  const sitemapResponse=await fetch(base+'/sitemap.xml');
  assert.equal(sitemapResponse.status,200);
  const sitemap=await sitemapResponse.text();
  assert.match(sitemap,/<loc>https:\/\/heroauction\.com\.tr\/<\/loc>/);
  assert.doesNotMatch(sitemap,/privacy/);
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()});
 }
});
