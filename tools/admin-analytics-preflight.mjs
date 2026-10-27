// Read-only operator preflight. No schema, balance, flags or activation change.
import {pathToFileURL} from 'node:url';
import {TARGET,NEW_TABLES,parseArgs,validateRuntime,loadManifest,loadApprovedSchema,connect,begin,SQL,verifyIdentity,readCatalog,verifyCatalog,preservation,schemaDigest,safeError,refuse} from './admin-analytics-release-common.mjs';
export async function preflight(client,args,manifest,approved){
 args=parseArgs(Object.entries(args).flatMap(([key,value])=>['--'+key,value]));
 try{
  await begin(client,true);verifyIdentity((await client.query(SQL.identity)).rows[0],true);
  const catalog=await readCatalog(client),state=verifyCatalog(catalog,approved);
  if(state!==args['expect-state'])refuse('EXPECTED_SCHEMA_STATE_MISMATCH');
  const preserved=await preservation(client,catalog);
  await client.query('ROLLBACK');
  return {status:'preflight_passed',readOnly:true,service:TARGET.service,database:TARGET.database,owner:TARGET.owner,postgresMajor:18,commit:args['expect-commit'],schemaState:state,
   manifestSha256:manifest.manifestSha256,migrations:manifest.entries.map(({version,name,sha256})=>({version,name,sha256})),approvedSchemaSha256:approved.schemaSha256,
   existingSchemaSha256:schemaDigest(catalog.filter(row=>!NEW_TABLES.includes(row.name))),newSchemaSha256:state==='complete'?schemaDigest(catalog.filter(row=>NEW_TABLES.includes(row.name))):null,
   preservation:preserved,newFlagsOff:true,existingEconomyFlagsChanged:false,backupVerified:false,activationPerformed:false,releaseProvenanceRecorded:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
export async function main(argv=process.argv.slice(2),env=process.env){let client;try{
 const args=parseArgs(argv),config=validateRuntime(env,args),manifest=await loadManifest(),approved=await loadApprovedSchema();
 client=await connect(config);console.log(JSON.stringify(await preflight(client,args,manifest,approved),null,2));return 0;
}catch(error){console.error('REFUSED: '+safeError(error)+'. No activation performed.');return 1}finally{if(client)await client.end().catch(()=>{})}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
