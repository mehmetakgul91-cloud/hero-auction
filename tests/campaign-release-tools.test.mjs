import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TARGET,CONFIRMATION,parseArgs,validateRuntime,loadRelease,MIGRATION_SHA} from '../tools/campaign-release-common.mjs';
const args={'expect-service':TARGET.service,'expect-database':TARGET.database,'expect-owner':TARGET.owner,'expect-major':'18','expect-commit':'a'.repeat(40),'expect-state':'absent'};
const argv=o=>Object.entries(o).flatMap(([k,v])=>['--'+k,v]);
const env={RENDER:'true',RENDER_SERVICE_ID:TARGET.service,RENDER_SERVICE_TYPE:'web',RENDER_GIT_COMMIT:args['expect-commit'],RENDER_GIT_REPO_SLUG:TARGET.repo,DATABASE_URL:`postgresql://${TARGET.owner}:fixture-not-a-secret@${TARGET.host}/${TARGET.database}`};
test('campaign012 manifest pins exactly one migration and approved schema',async()=>{
 const r=await loadRelease();assert.equal(r.manifest.version,12);assert.equal(r.manifest.sha256,MIGRATION_SHA);assert.equal(r.statements.length,2);assert.equal(r.approved.tables.length,1);
 await assert.rejects(loadRelease(async(url)=>url.pathname.endsWith('.sql')?readFileSync(url,'utf8')+'-- changed':readFileSync(url,'utf8')));
});
test('campaign operator enforces explicit target/build/flag/connection and rejects ambient overrides',()=>{
 assert.equal(parseArgs(argv(args))['expect-major'],'18');assert.equal(validateRuntime(env,args).connectionTimeoutMillis,5000);
 for(const patch of [{RENDER:'false'},{RENDER_GIT_COMMIT:'b'.repeat(40)},{RENDER_GIT_REPO_SLUG:'other/repo'},{HERO_CAMPAIGN_MEASUREMENT_ENABLED:'1'},{PGHOST:'wrong'},{DATABASE_URL:'postgresql://test:test@127.0.0.1/test'}])assert.throws(()=>validateRuntime({...env,...patch},args));
 // Existing analytics/economy flags are neither required OFF nor changed.
 assert.ok(validateRuntime({...env,HERO_PLAYER_ANALYTICS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1'},args));
 for(const patch of [{'expect-major':'17'},{'expect-owner':'test'},{'expect-commit':'main'},{'expect-state':'partial'}])assert.throws(()=>parseArgs(argv({...args,...patch})));
});
test('apply needs exact confirmation/digests/backup and is absent from startup',async()=>{
 const r=await loadRelease(),apply={...args,'manifest-sha256':r.manifestSha256,'schema-sha256':r.approved.schemaSha256,'backup-reference':'verified-backup-reference',confirm:CONFIRMATION};
 assert.ok(parseArgs(argv(apply),true));assert.throws(()=>parseArgs(argv({...apply,confirm:'yes'}),true));assert.throws(()=>parseArgs(argv({...apply,'backup-reference':''}),true));
 assert.doesNotMatch(readFileSync('server.js','utf8'),/campaign-release-common|apply-campaign-migration|campaign-preflight/);
});
