import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { readConfig } from '../src/policy.js';
import { packageImages, checkPackageSize, filesIn } from './package-assets.mjs';
export const mobile = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(mobile, '..');
export function adaptSource(source, filename) {
  if (filename.endsWith('.html')) return source
    .replace('<html ', '<html class="hero-native" ')
    .replace(/<script\b[^>]*src=["']https:\/\/(?:pagead2\.googlesyndication\.com|accounts\.google\.com)[^"']*["'][^>]*><\/script>/gi, '')
    .replace(/<script\b[^>]*src=["']\/ad-rewards\.js[^"']*["'][^>]*><\/script>/gi, '')
    .replace(/<div id="google-login"><\/div>/g, '<p class="native-google-note">Android testinde yalnızca misafir girişi kullanılabilir. Google hesabı henüz desteklenmiyor.</p>')
    .replace(/Misafir veya Google girişiyle oynayabilirsin\./g, 'Test sunucusu bağlandığında misafir olarak oynayabilirsin.')
    .replace(/<a class="arena-3d-launch"[^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/href="https:\/\/heroauction\.com\.tr\/"/g, 'href="/"')
    .replace('width=device-width,initial-scale=1', 'width=device-width,initial-scale=1,viewport-fit=cover')
    .replace('<head>', '<head><script src="/native-config.js"></script><script src="/native-runtime.js"></script>')
    .replace('</head>', '<link rel="stylesheet" href="/native.css"></head>');
  if (filename === 'app.js') {
    if (!source.includes('function connect(){stream?.close();if(!session)return;')) throw Error('Native SSE lifecycle adapter needs review after source change');
    if (!source.includes('origin:location.origin,navigator,notify')) throw Error('Invite origin adapter needs review after source change');
    return source.replace('origin:location.origin,navigator,notify', 'origin:window.HeroNative.publicOrigin,navigator,notify')
      .replace('function connect(){stream?.close();if(!session)return;', 'function connect(){stream?.close();if(!session||window.HeroNative.active===false)return;')
      // No legacy external PokeAPI request in the original-only Android roster.
      .replace('restoreGame();loadPokeMap();refreshOnline()', 'restoreGame();refreshOnline()') + `\n// Android-only lifecycle: reconnect from authoritative server state.\nwindow.addEventListener('hero:native-pause',()=>{stream?.close();stream=null;void auctionSfxContext?.suspend().catch(()=>{});});\nwindow.addEventListener('hero:native-resume',()=>{void restoreGame().then(()=>{if(session)connect();});void refreshOnline();void refreshGold();});\n`;
  }
  if (filename === 'battle-preview.js') return source.replaceAll("'https://heroauction.com.tr/'", "'/'")
    .replace("if(document.hidden||document.visibilityState==='hidden'){", "if(document.hidden||document.visibilityState==='hidden'||window.HeroNative.active===false){");
  return source;
}
export async function buildNative() {
  let raw;
  try {raw=await readFile(path.join(mobile,'config.local.json'),'utf8');}
  catch (error) {if(error.code!=='ENOENT')throw error;raw=await readFile(path.join(mobile,'config.example.json'),'utf8');}
  const config=readConfig(JSON.parse(raw));
  const out=path.join(mobile,'www');
  await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
  for (const item of await readdir(path.join(root,'public'),{withFileTypes:true})) {
    if (/^(?:images$|original$|original-heroes\.html$|commander-training\.html$|admin|arena-3d|arena-model|models$|platform\.js$|crazygames-privacy\.html$|ad-rewards\.js$|ads\.txt$|robots\.txt$|sitemap\.xml$)/.test(item.name)) continue;
    const src=path.join(root,'public',item.name),dest=path.join(out,item.name);
    if (item.isDirectory()) await cp(src,dest,{recursive:true});
    else if (/\.(html|js)$/.test(item.name)) await writeFile(dest,adaptSource(await readFile(src,'utf8'),item.name));
    else await cp(src,dest);
  }
  await writeFile(path.join(out,'native-config.js'),'window.__HERO_NATIVE_CONFIG__='+JSON.stringify(config)+';\n');
  await cp(path.join(mobile,'src/native.css'),path.join(out,'native.css'));
  await build({entryPoints:[path.join(mobile,'src/runtime.js')],outfile:path.join(out,'native-runtime.js'),bundle:true,format:'iife',target:'chrome100',legalComments:'eof'});
  const gameSource=JSON.parse(await readFile(path.join(mobile,'game-source.json'),'utf8'));
  const {version}=JSON.parse(await readFile(path.join(mobile,'package.json'),'utf8'));
  await writeFile(path.join(out,'native-build.json'),JSON.stringify({app:'Hero Auction Test',version,gameSource,apiOrigin:config.apiOrigin,configured:config.configured},null,2)+'\n');
  const images=await packageImages(root,out);
  const hashes={};
  for(const file of await filesIn(out))hashes[file]=createHash('sha256').update(await readFile(path.join(out,file))).digest('hex');
  await writeFile(path.join(out,'native-files.json'),JSON.stringify(hashes,null,2)+'\n');
  const report=await checkPackageSize(out,images);
  await writeFile(path.join(mobile,'package-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Android package: ${(report.webBytes/1e6).toFixed(2)} MB web assets; ${report.heroCount} hero portraits; ${report.omitted.length} unused image-directory files excluded.`);
  console.log(config.configured?'Android assets prepared; backend connectivity is NOT yet verified.':'Android UI preview assets prepared; no backend configured, gameplay unavailable.');
  return config;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildNative();
