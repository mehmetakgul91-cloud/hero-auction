// Explicit read-only Render Shell command. No migrations, grants or rewards.
import {pathToFileURL} from 'node:url';
import {parseArgs,validateRuntime,loadManifest,connect,begin,SQL,verifyIdentity,readCatalog,verifyCatalog,readVersion,preservation,schemaDigest,safeError,refuse,TARGET} from './economy-release-common.mjs';
export async function preflight(client,args,manifest){
 try{
  await begin(client,true);
  const identity=(await client.query(SQL.identity)).rows[0];verifyIdentity(identity,true);
  const catalog=await readCatalog(client);verifyCatalog(catalog);
  const state=await readVersion(client,catalog,manifest);
  if(state.version!==Number(args['expect-version']))refuse('EXPECTED_SCHEMA_VERSION_MISMATCH');
  const preserved=await preservation(client),activity=(await client.query(SQL.activity)).rows[0];
  if(!activity||!/^\d+$/.test(activity.unsettled_paid_rooms)||!/^\d+$/.test(activity.pending_chest_rooms))refuse('INVALID_ACTIVITY_RESULT');
  await client.query('ROLLBACK');
  return {status:'preflight_passed',readOnly:true,service:TARGET.service,database:TARGET.database,postgresMajor:18,commit:args['expect-commit'],schemaVersion:state.version,targetVersion:5,schemaAppliedByCommit:state.ledger[0]?.release_commit||null,schemaRecordedBackupReference:state.ledger[0]?.backup_reference||null,
   manifestSha256:manifest.manifestSha256,migrations:manifest.entries.map(({version,name,sha256})=>({version,name,sha256})),schemaSha256:schemaDigest(catalog),preservation:preserved,activity,
   flagsOff:true,ddlPermissions:true,backupVerified:false,activationApproved:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
export async function main(argv=process.argv.slice(2),env=process.env){
 let client;
 try{
  const args=parseArgs(argv),config=validateRuntime(env,args),manifest=await loadManifest();
  client=await connect(config);const result=await preflight(client,args,manifest);console.log(JSON.stringify(result,null,2));return 0;
 }catch(error){console.error('REFUSED: '+safeError(error)+'. No activation performed.');return 1;}
 finally{if(client)await client.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
