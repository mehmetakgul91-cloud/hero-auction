// Explicit, approved operator action only: exactly THREE tables from006/007.
// No fourth ledger, no ALTER of001–005, no wallet DML and no flag activation.
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {TARGET,NEW_TABLES,parseArgs,validateRuntime,loadManifest,loadApprovedSchema,connect,begin,SQL,verifyIdentity,readCatalog,verifyCatalog,preservation,schemaDigest,safeError,refuse} from './admin-analytics-release-common.mjs';
export async function applyMigrations(client,args,manifest,approved){
 args=parseArgs(Object.entries(args).flatMap(([key,value])=>['--'+key,value]),true);
 if(args['manifest-sha256']!==manifest.manifestSha256||args['schema-sha256']!==approved.schemaSha256)refuse('REVIEWED_DIGEST_MISMATCH');
 let commitAttempted=false;
 try{
  await begin(client,false);verifyIdentity((await client.query(SQL.identity)).rows[0],false);
  if((await client.query(SQL.advisory)).rows[0]?.locked!==true)refuse('ANOTHER_ADMIN_ANALYTICS_MIGRATION_IS_RUNNING');
  const original=await readCatalog(client),state=verifyCatalog(original,approved);
  if(state==='complete'){
   // No metadata ledger is authorized. This proves the exact approved schema is
   // already durable, NOT who/when applied it or which backup preceded it.
   await client.query('ROLLBACK');return {status:'already_present_exact_schema_verified',replayed:true,schemaState:'complete',manifestSha256:manifest.manifestSha256,newSchemaSha256:approved.schemaSha256,releaseProvenanceRecorded:false,flagsChanged:false};
  }
  const before=await preservation(client,original),beforeSchema=schemaDigest(original);
  for(const entry of manifest.entries)await client.query(entry.statements.join(';\n')+';');
  const afterCatalog=await readCatalog(client);if(verifyCatalog(afterCatalog,approved)!=='complete')refuse('MIGRATION_SCHEMA_INCOMPLETE');
  const existing=afterCatalog.filter(row=>!NEW_TABLES.includes(row.name));
  if(schemaDigest(existing)!==beforeSchema||existing.length!==original.length||afterCatalog.length!==original.length+3)refuse('PREEXISTING_SCHEMA_CHANGED');
  for(const name of NEW_TABLES){const row=(await client.query('/* admin-release:empty-new */ SELECT count(*)::text AS count FROM public.'+name)).rows[0];if(row?.count!=='0')refuse('NEW_TABLE_NOT_EMPTY');}
  const after=await preservation(client,afterCatalog);if(!isDeepStrictEqual(before,after))refuse('PREEXISTING_DATA_CHANGED');
  commitAttempted=true;await client.query('COMMIT');
  return {status:'applied',replayed:false,service:TARGET.service,database:TARGET.database,owner:TARGET.owner,commit:args['expect-commit'],schemaState:'complete',tablesCreated:NEW_TABLES,
   manifestSha256:manifest.manifestSha256,newSchemaSha256:approved.schemaSha256,existingSchemaSha256:beforeSchema,preservation:after,preservedExistingSnapshot:true,
   backupReference:args['backup-reference'],backupExternallyVerifiedRequired:true,releaseProvenanceRecorded:false,flagsChanged:false,existingEconomyFlagsChanged:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});if(commitAttempted)refuse('COMMIT_OUTCOME_UNKNOWN_RUN_READ_ONLY_PREFLIGHT');throw error}
}
export async function main(argv=process.argv.slice(2),env=process.env){let client;try{
 const args=parseArgs(argv,true),config=validateRuntime(env,args),manifest=await loadManifest(),approved=await loadApprovedSchema();
 if(args['manifest-sha256']!==manifest.manifestSha256||args['schema-sha256']!==approved.schemaSha256)refuse('REVIEWED_DIGEST_MISMATCH');
 client=await connect(config);console.log(JSON.stringify(await applyMigrations(client,args,manifest,approved),null,2));return 0;
}catch(error){console.error('REFUSED: '+safeError(error)+'. No activation performed.');return 1}finally{if(client)await client.end().catch(()=>{})}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
