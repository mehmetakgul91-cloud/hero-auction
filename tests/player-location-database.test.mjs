import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {refreshDbipDatabase,createManagedLocationResolver} from '../player-geoip-database.js';

const now=new Date('2026-10-29T00:00:00Z');
const reader=(date='2026-10-01T00:00:00Z',type='DBIP-City-Lite')=>({metadata:{buildEpoch:new Date(date),databaseType:type},get:()=>({country:{iso_code:'TR'},city:{names:{en:'Izmir'}},location:{latitude:38}})});
async function fixture(t){const dir=await mkdtemp(path.join(tmpdir(),'hero-geo-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return path.join(dir,'city.mmdb');}
test('monthly data is streamed from the fixed provider and atomically validated before replacement',async t=>{
 const file=await fixture(t),calls=[];
 const result=await refreshDbipDatabase({file,now,fetcher:async(url,options)=>{calls.push({url,options});return new Response(gzipSync('synthetic-mmdb'));},openDatabase:async file=>{assert.equal(await readFile(file,'utf8'),'synthetic-mmdb');return reader();}});
 assert.equal(result.metadata.databaseType,'DBIP-City-Lite');assert.equal(await readFile(file,'utf8'),'synthetic-mmdb');
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://download.db-ip.com/free/dbip-city-lite-2026-10.mmdb.gz');assert.equal(calls[0].options.redirect,'error');
 assert.deepEqual(Object.keys(calls[0].options).sort(),['redirect','signal']);assert.equal((await readdir(path.dirname(file))).length,1);
});
test('a current database needs no download; a failed update preserves a valid previous release',async t=>{
 const file=await fixture(t);await writeFile(file,'original');let requests=0;
 const fetcher=async()=>{requests++;throw Error('offline');};
 assert.equal((await refreshDbipDatabase({file,now,fetcher,openDatabase:async()=>reader()})).metadata.buildEpoch.getUTCMonth(),9);assert.equal(requests,0);
 assert.equal((await refreshDbipDatabase({file,now,fetcher,openDatabase:async()=>reader('2026-09-01')})).metadata.buildEpoch.getUTCMonth(),8);assert.equal(requests,1);assert.equal(await readFile(file,'utf8'),'original');
});
test('corrupt and wrong-release responses never replace the existing database',async t=>{
 const file=await fixture(t);await writeFile(file,'original');
 for(const badReader of [reader('2026-10-01','Country'),reader('2025-01-01'),reader('2026-12-01'),reader('2026-09-01')]){
  const old=reader('2026-09-01');const result=await refreshDbipDatabase({file,now,fetcher:async()=>new Response(gzipSync('invalid')),openDatabase:async p=>p===file?old:badReader});assert.equal(result,old);assert.equal(await readFile(file,'utf8'),'original');
 }
 await assert.rejects(refreshDbipDatabase({file,now,fetcher:async()=>new Response('bad gzip'),openDatabase:async()=>{throw Error('missing');}}));
 assert.equal(await readFile(file,'utf8'),'original');assert.equal((await readdir(path.dirname(file))).length,1);
});
test('disabled managed lookup never downloads; enabled missing database fails safely',async t=>{
 let downloads=0;const deps={fetcher:async()=>{downloads++;throw Error('offline');},openDatabase:async()=>{throw Error('missing');}};
 assert.equal((await createManagedLocationResolver({HERO_GEOIP_PROVIDER:'dbip-lite'},deps)).available,false);assert.equal(downloads,0);
 const managed=await createManagedLocationResolver({HERO_PLAYER_GEO_ENABLED:'1',HERO_GEOIP_PROVIDER:'dbip-lite',HERO_GEOIP_DATABASE:await fixture(t)},deps);t.after(()=>managed.close());assert.equal(managed.available,false);assert.equal(managed.lookup({}),null);assert.equal(downloads,1);
});
