// One-time, explicitly approved Render Shell migration. NOT a server startup,
// pre-deploy, npm, payment, claim, flag or general-purpose SQL command.
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseArgs,validateRuntime,loadManifest,connect,begin,SQL,verifyIdentity,readCatalog,verifyCatalog,readVersion,preservation,schemaDigest,safeError,refuse,TARGET,LEDGER,NEW_TABLES,BASE_TABLES} from './economy-release-common.mjs';
export const CREATE_LEDGER=`/* economy-release:create-ledger */ CREATE TABLE public.hero_auction_economy_migrations (
 version SMALLINT PRIMARY KEY CHECK(version BETWEEN 1 AND 5),filename TEXT NOT NULL UNIQUE,
 sha256 CHAR(64) NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),manifest_sha256 CHAR(64) NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
 release_commit CHAR(40) NOT NULL CHECK(release_commit ~ '^[0-9a-f]{40}$'),backup_reference VARCHAR(120) NOT NULL,
 schema_sha256 CHAR(64) NOT NULL CHECK(schema_sha256 ~ '^[0-9a-f]{64}$'),preservation_sha256 CHAR(64) NOT NULL CHECK(preservation_sha256 ~ '^[0-9a-f]{64}$'),
 applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`;
export async function applyMigrations(client,args,manifest){
 args=parseArgs(Object.entries(args).flatMap(([key,value])=>['--'+key,value]),true);
 if(args['manifest-sha256']!==manifest.manifestSha256)refuse('REVIEWED_MANIFEST_MISMATCH');
 let commitAttempted=false;
 try{
  await begin(client,false);
  const identity=(await client.query(SQL.identity)).rows[0];verifyIdentity(identity,false);
  if((await client.query(SQL.advisory)).rows[0]?.locked!==true)refuse('ANOTHER_ECONOMY_MIGRATION_IS_RUNNING');
  const originalCatalog=await readCatalog(client);verifyCatalog(originalCatalog);
  const state=await readVersion(client,originalCatalog,manifest);
  if(state.version===5){
   // Exact same manifest + stored schema is already committed. In particular a
   // lost COMMIT response must NEVER send CREATE/ALTER/INSERT a second time.
   if(!state.ledger.every(row=>row.release_commit===args['expect-commit']&&row.backup_reference===args['backup-reference']))refuse('REPLAY_RELEASE_REFERENCE_MISMATCH');
   await client.query('ROLLBACK');
   return {status:'already_applied_verified',replayed:true,schemaVersion:5,manifestSha256:manifest.manifestSha256,schemaSha256:schemaDigest(originalCatalog),flagsChanged:false};
  }
  if(state.version!==Number(args['expect-version'])||state.version!==0)refuse('EXPECTED_SCHEMA_VERSION_MISMATCH');
  const before=await preservation(client);
  await client.query(CREATE_LEDGER);
  for(const entry of manifest.entries)await client.query(entry.statements.join(';\n')+';');
  const finalCatalog=await readCatalog(client);verifyCatalog(finalCatalog,true);
  if(schemaDigest(originalCatalog.filter(r=>BASE_TABLES.includes(r.name)))!==schemaDigest(finalCatalog.filter(r=>BASE_TABLES.includes(r.name))))refuse('EXISTING_BASE_SCHEMA_CHANGED');
  if((await client.query(SQL.sequence)).rows[0]?.permitted!==true)refuse('LEDGER_SEQUENCE_PERMISSION_MISSING');
  // Flags were proved OFF before connect. Fresh tables must still be empty: no
  // backfill, balances, levels, welcome/daily awards or fixture users are allowed.
  for(const name of NEW_TABLES){const row=(await client.query('/* economy-release:empty-new-table */ SELECT count(*)::text AS count FROM public.'+name)).rows[0];if(row?.count!=='0')refuse('NEW_ECONOMY_TABLE_NOT_EMPTY');}
  const after=await preservation(client);
  if(!isDeepStrictEqual(before,after))refuse('EXISTING_WALLET_OR_PROFILE_CHANGED');
  const digest=schemaDigest(finalCatalog);
  for(const entry of manifest.entries)await client.query('/* economy-release:record */ INSERT INTO public.'+LEDGER+'(version,filename,sha256,manifest_sha256,release_commit,backup_reference,schema_sha256,preservation_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[entry.version,entry.name,entry.sha256,manifest.manifestSha256,args['expect-commit'],args['backup-reference'],digest,before.sha256]);
  commitAttempted=true;await client.query('COMMIT');
  return {status:'applied',replayed:false,service:TARGET.service,database:TARGET.database,commit:args['expect-commit'],schemaVersion:5,manifestSha256:manifest.manifestSha256,schemaSha256:digest,preservation:after,preservedExistingData:true,flagsChanged:false};
 }catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  // A timeout/disconnect at COMMIT is uncertain, not proof of a rollback. The
  // same guarded command can reconcile the ledger on an explicitly approved retry.
  if(commitAttempted)refuse('COMMIT_OUTCOME_UNKNOWN_RUN_READ_ONLY_PREFLIGHT');
  throw error;
 }
}
export async function main(argv=process.argv.slice(2),env=process.env){
 let client;
 try{
  const args=parseArgs(argv,true),config=validateRuntime(env,args),manifest=await loadManifest();
  if(args['manifest-sha256']!==manifest.manifestSha256)refuse('REVIEWED_MANIFEST_MISMATCH');
  client=await connect(config);console.log(JSON.stringify(await applyMigrations(client,args,manifest),null,2));return 0;
 }catch(error){console.error('REFUSED: '+safeError(error)+'. No activation performed.');return 1;}
 finally{if(client)await client.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
