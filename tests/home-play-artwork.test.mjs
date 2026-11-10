import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url));
const html=read('public/index.html').toString();
const css=read('public/lobby-chrome.css').toString();
const playButton=html.match(/<button\b[^>]*id="home-play-tab"[\s\S]*?<\/button>/)?.[0];

test('Play artwork browser QA runs in CI when artwork, layout or its checks change',()=>{
 const workflow=read('.github/workflows/commander-switch-browser.yml').toString();
 for(const entry of ['public/lobby-chrome.css','public/images/optimized/home-play-arena.*.webp','tests/home-play-artwork.test.mjs','tools/test-home-play-artwork-browser.mjs'])assert.ok(workflow.includes("- '"+entry+"'"));
 assert.match(workflow,/run: env -u DATABASE_URL node tools\/test-home-play-artwork-browser\.mjs/);
 assert.match(workflow,/HERO_BROWSER_SCREENSHOTS:.*commander-switch-shots\/play-artwork/);
 assert.match(workflow,/path:.*commander-switch-shots/);
});

test('home Play artwork is distinct, local and content-versioned',()=>{
 assert.ok(playButton);
 const source=playButton.match(/<img\s[^>]*src="([^"]+)"/)?.[1];
 assert.match(source,/^\/images\/optimized\/home-play-arena\.([a-f0-9]{16})\.webp$/);
 assert.doesNotMatch(source,/commander-/);
 const bytes=read('public'+source);
 assert.equal(bytes.subarray(0,4).toString(),'RIFF');
 assert.equal(bytes.subarray(8,12).toString(),'WEBP');
 assert.ok(bytes.length<100_000,'small menu asset should remain under 100 kB');
 assert.ok(source.includes(createHash('sha256').update(bytes).digest('hex').slice(0,16)));
 assert.match(playButton,/width="768" height="512"/);
});

test('art replacement preserves Play accessibility and navigation hooks',()=>{
 assert.match(playButton,/type="button"/);
 assert.match(playButton,/aria-expanded="false" aria-controls="home-play-panel"/);
 assert.match(playButton,/class="nav-art nav-art-play" aria-hidden="true"/);
 assert.match(playButton,/<img[^>]*alt=""/);
 assert.match(playButton,/<span class="nav-label">Oyna<\/span>/);
 assert.match(html,/id="nav-commander-portrait"/);
 assert.match(read('public/app.js').toString(),/"attack":"\/images\/optimized\/commander-attack\.bad033e5f738a797\.webp"/);
});

test('landscape crop and mask are scoped only to Play, with cache-busted CSS',()=>{
 const rule=css.match(/\.nav-art-play>img\{([^}]+)\}/)?.[1];
 assert.ok(rule);
 assert.match(rule,/height:100%/);
 assert.match(rule,/object-position:center 45%/);
 assert.match(rule,/mask-image:linear-gradient\(#000 68%,transparent 100%\)/);
 assert.match(rule,/-webkit-mask-image:linear-gradient\(#000 68%,transparent 100%\)/);
 assert.match(rule,/opacity:1/);
 assert.match(html,/\/lobby-chrome\.css\?v=play-arena-20261110/);
});

test('Play artwork is served intact by normal web and CrazyGames routes',{timeout:15000},async()=>{
 const {createServer}=await import('node:net');
 const {spawn}=await import('node:child_process');
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:'',COMMANDER_TEST_GUEST_MODE:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
 try{
  let ready=false;for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error(logs);try{const response=await fetch(origin+'/api/info');await response.text();if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,40));}assert.ok(ready,logs);
  const source=playButton.match(/<img\s[^>]*src="([^"]+)"/)[1];
  for(const prefix of ['','/crazygames']){
   const response=await fetch(origin+prefix+source);
   assert.equal(response.status,200,prefix+' artwork route');
   assert.equal(response.headers.get('content-type'),'image/webp');
   assert.equal(response.headers.get('cache-control'),'no-store','new menu artwork does not broaden immutable cache allowlists');
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),read('public'+source));
   const page=await fetch(origin+prefix+'/');assert.equal(page.status,200);
   const pageHtml=await page.text();assert.ok(pageHtml.includes('home-play-arena.da9037bd905f1998.webp'));assert.ok(pageHtml.includes('lobby-chrome.css?v=play-arena-20261110'));
  }
 }finally{server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(resolve,2000).unref();});}
});
