import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { apiUrl, linkAction, readConfig } from '../src/policy.js';
import { adaptSource, buildNative } from '../scripts/build.mjs';
import { MAX_WEB_BYTES } from '../scripts/package-assets.mjs';
const local='https://localhost',api='https://api.example.com',pub='https://heroauction.com.tr';
test('config only accepts fixed HTTPS origins and fails closed for unconfigured preview',()=>{
  assert.equal(readConfig({apiOrigin:'https://example.invalid',publicOrigin:'https://example.invalid'}).configured,false);
  assert.equal(readConfig({apiOrigin:api,publicOrigin:api}).configured,true);
  assert.throws(()=>readConfig({apiOrigin:api,publicOrigin:pub}),/same server/);
  for(const value of ['http://api.example.com','https://name:secret@api.example.com','https://api.example.com/path','https://api.example.com/?token=x','https://api.example.com/#x']) assert.throws(()=>readConfig({apiOrigin:value,publicOrigin:pub}));
});
test('only same-origin /api paths are rewritten, preserving query and never forwarding local assets',()=>{
  assert.equal(apiUrl('/api/events?code=123&authToken=secret',local,api),api+'/api/events?code=123&authToken=secret');
  for(const value of ['/images/a.png','/app.js','https://evil.example/api/auth','//evil.example/api/state','/api-other']) assert.equal(apiUrl(value,local,api),null);
});
test('links keep local game inside wrapper, strip foreign credentials and block unsafe schemes',()=>{
  assert.deepEqual(linkAction(pub+'/?join=123&authToken=secret',local,pub),{kind:'local',url:local+'/?join=123'});
  assert.deepEqual(linkAction(pub+'/privacy',local,pub),{kind:'local',url:local+'/privacy.html'});
  assert.deepEqual(linkAction('/privacy',local,pub),{kind:'local',url:local+'/privacy.html'});
  assert.deepEqual(linkAction('mailto:mehmetakgul91@gmail.com',local,pub),{kind:'contact',email:'mehmetakgul91@gmail.com'});
  assert.equal(linkAction('https://example.com/help',local,pub).kind,'external');
  assert.equal(linkAction('mailto:destek@heroauction.com.tr',local,pub).kind,'contact');
  for(const value of ['javascript:alert(1)','intent://example','file:///x','http://example.com','https://name:pass@example.com','/api/events?token=x','mailto:unknown@example.com']) assert.equal(linkAction(value,local,pub).kind,'blocked');
});
test('generated entry excludes unsupported native Google/ads but preserves moderation/friends',async()=>{
  const original=await readFile(new URL('../../public/index.html',import.meta.url),'utf8');
  const output=adaptSource(original,'index.html');
  assert.doesNotMatch(output,/accounts\.google\.com|\/ad-rewards\.js|id="google-login"|class="arena-3d-launch"/);
  for(const name of ['native-runtime.js','native-config.js','moderation.js','moderation.css','friends-panel','room-invites','viewport-fit=cover'])assert.ok(output.includes(name),name);
});
test('native app transforms preserve gameplay and public invitation URLs',async()=>{
  const source=await readFile(new URL('../../public/app.js',import.meta.url),'utf8');
  const output=adaptSource(source,'app.js');
  assert.match(output,/origin:window.HeroNative.publicOrigin/);
  assert.match(output,/hero:native-resume/);
  assert.match(output,/if\(!session\|\|window.HeroNative.active===false\)return;/);
  assert.doesNotMatch(output,/restoreGame\(\);loadPokeMap\(\)/);
  assert.match(output,/post\('\/api\/bot'/);
  const battle=adaptSource(await readFile(new URL('../../public/battle-preview.js',import.meta.url),'utf8'),'battle-preview.js');
  assert.doesNotMatch(battle,/location.replace\('https:\/\/heroauction.com.tr\/'\)/);
});
test('complete native assets build with no admin/development distribution',async()=>{
  await buildNative();
  await access(new URL('../www/index.html',import.meta.url));
  await access(new URL('../www/images/lobby-crest.svg',import.meta.url));
  await access(new URL('../www/moderation.js',import.meta.url));
  for(const file of ['admin.html','admin.js','platform.js','arena-3d.html','original-heroes.html','commander-training.html','images/original/hero-10.png','images/original/expansion-09.webp'])await assert.rejects(access(new URL('../www/'+file,import.meta.url)));
  const roster=JSON.parse(await readFile(new URL('../../commander-original-roster.json',import.meta.url),'utf8'));
  const aliases=JSON.parse(await readFile(new URL('../www/native-image-aliases.json',import.meta.url),'utf8'));
  assert.equal(roster.characters.length,50);
  for(const hero of roster.characters){
    const image=await sharp(await readFile(new URL('../www/'+(aliases[hero.portrait]||hero.portrait.slice(1)),import.meta.url))).metadata();
    assert.ok(image.width>0&&image.width<=640&&image.height>0&&image.height<=640,hero.id);
    assert.equal(image.format,'webp',hero.id);
  }
  const music='audio/hero-auction-senkron-davul-bas-2dk.mp3';
  assert.deepEqual(await readFile(new URL('../www/'+music,import.meta.url)),await readFile(new URL('../../public/'+music,import.meta.url)));
  const report=JSON.parse(await readFile(new URL('../package-report.json',import.meta.url),'utf8'));
  assert.ok(report.webBytes<MAX_WEB_BYTES,JSON.stringify(report));
  for(const track of ['determined-pursuit','eternal-sands','atlas-kazakhstan','japanese-fight','monkoto','ragnarok']) {
    const file='audio/arena/'+track+'.mp3';
    assert.deepEqual(await readFile(new URL('../www/'+file,import.meta.url)),await readFile(new URL('../../public/'+file,import.meta.url)));
  }
  assert.ok(report.omitted.includes('images/original/hero-10.png'));
  assert.ok(Object.keys(aliases).length>0);
  for(const file of await readdir(new URL('../../public/images/arena-themes/',import.meta.url))) {
    assert.deepEqual(await readFile(new URL('../www/images/arena-themes/'+file,import.meta.url)),await readFile(new URL('../../public/images/arena-themes/'+file,import.meta.url)),file+' keeps source scene quality');
  }
  for(const branch of ['attack','defense','magic','support'])await access(new URL('../www/images/commander-branch-'+branch+'.svg',import.meta.url));
  for(const [source,destination] of Object.entries(aliases)) {
    const original=await sharp(await readFile(new URL('../../public'+source,import.meta.url))).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer();
    const encoded=await sharp(await readFile(new URL('../www/'+destination,import.meta.url))).ensureAlpha().raw().toBuffer();
    assert.deepEqual(encoded,original,source+' must be pixel-identical after existing resize');
    await assert.rejects(access(new URL('../www'+source,import.meta.url)));
  }
});

