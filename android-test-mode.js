// Explicit storage/auth isolation for ONE pre-existing Android test service.
// Never infer this from a native client, hostname, CORS setting or missing database.
export const ANDROID_TEST_RENDER_SERVICE_ID='srv-dbbn8ms9v7es73fpqkb0';
export function androidTestMemoryMode(env={}){
 if(env.ANDROID_TEST_MEMORY_ONLY!=='1')return false;
 const onRender=Object.keys(env).some(key=>(key==='RENDER'||key.startsWith('RENDER_'))&&Boolean(env[key]));
 if(onRender){
  if(env.RENDER!=='true'||env.RENDER_SERVICE_ID!==ANDROID_TEST_RENDER_SERVICE_ID)throw Error('Android memory-only mode is restricted to the approved test service.');
 }else if(env.NODE_ENV!=='test')throw Error('Local Android memory-only mode requires NODE_ENV=test.');
 return true;
}
