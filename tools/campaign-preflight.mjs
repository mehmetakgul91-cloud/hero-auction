// Explicit operator only; no activation and no credential output.
import {pathToFileURL} from 'node:url';
import {parseArgs,validateRuntime,loadRelease,connect,operate,safeError} from './campaign-release-common.mjs';
export async function main(argv=process.argv.slice(2),env=process.env){let client;try{
 const args=parseArgs(argv,false),config=validateRuntime(env,args),release=await loadRelease();
 client=await connect(config);console.log(JSON.stringify(await operate(client,args,release,false),null,2));return 0;
}catch(error){console.error('REFUSED: '+safeError(error)+'. No activation performed.');return 1}finally{if(client)await client.end().catch(()=>{})}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
