// Ephemeral CI/local fixture. No Render credentials, deployment or shared data.
// The self-signed localhost certificate is trusted only by generated debug code.
import {spawn, execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mobile=fileURLToPath(new URL('..',import.meta.url));
const root=path.resolve(mobile,'..');
const temp=path.join(mobile,'.test-backend');
await mkdir(temp,{recursive:true});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
  '-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),
  '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
const debug=path.join(mobile,'android/app/src/debug');
await mkdir(path.join(debug,'res/raw'),{recursive:true});
await mkdir(path.join(debug,'res/xml'),{recursive:true});
const cert=await readFile(path.join(temp,'cert.pem'));
await writeFile(path.join(debug,'res/raw/hero_test_ca.pem'),cert);
await writeFile(path.join(debug,'AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:networkSecurityConfig="@xml/hero_test_network" /></manifest>\n`);
await writeFile(path.join(debug,'res/xml/hero_test_network.xml'),`<network-security-config>
  <base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config>
  <domain-config cleartextTrafficPermitted="false"><domain>localhost</domain><trust-anchors><certificates src="@raw/hero_test_ca" /></trust-anchors></domain-config>
</network-security-config>\n`);
await writeFile(path.join(mobile,'config.local.json'),JSON.stringify({apiOrigin:'https://localhost:3443',publicOrigin:'https://localhost:3443'})+'\n');

// Deliberate allowlist: inherited DATABASE_URL, auth/admin credentials and
// economy feature flags cannot enter the game process.
const child=spawn(process.execPath,['server.js'],{cwd:root,stdio:['ignore','pipe','pipe'],env:{
  PATH:process.env.PATH,PORT:'3010',NODE_ENV:'test',DATABASE_URL:'',
  GOOGLE_CLIENT_ID:'',COMMANDER_TEST_GUEST_MODE:'1',NATIVE_ALLOWED_ORIGINS:'https://localhost'
}});
child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
const proxy=https.createServer({key:await readFile(path.join(temp,'key.pem')),cert},(req,res)=>{
  // Fixed loopback target. Streams SSE without buffering or URL logging.
  const upstream=http.request({hostname:'127.0.0.1',port:3010,path:req.url,method:req.method,headers:req.headers},reply=>{
    res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local test backend unavailable');});
  res.on('close',()=>upstream.destroy());req.pipe(upstream);
});
let closing=false;
function stop(code=0){
  if(closing)return;closing=true;
  proxy.close();proxy.closeAllConnections();child.kill('SIGTERM');
  setTimeout(()=>process.exit(code),300).unref();
}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
child.once('exit',code=>{if(!closing)stop(code||1);});
let ready=false;
for(let attempt=0;attempt<200;attempt++){
  if(child.exitCode!==null)throw Error('Isolated server exited before startup');
  try{const result=await fetch('http://127.0.0.1:3010/api/info');if(result.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
}
if(!ready){stop(1);throw Error('Isolated server startup timed out');}
proxy.listen(3443,'127.0.0.1',()=>console.log('ANDROID_FIXTURE_READY https://localhost:3443 (memory only)'));
proxy.on('error',error=>{console.error(error.message);stop(1);});
