import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,rename,rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {open} from 'maxmind';
import {createLocationResolver,databaseBuildTime} from './player-location.js';

const month=date=>date.toISOString().slice(0,7);
function byteLimit(max){let bytes=0;return new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>max?Error('Database size limit exceeded.'):null,chunk);}});}

// Only a public database is downloaded. No request IP, account or credential is
// sent to this provider. Updates are validated before an atomic file replacement.
export async function refreshDbipDatabase({file,now=new Date(),fetcher=fetch,openDatabase=open,cachedReader=null}){
 if(!file||!path.isAbsolute(file))throw Error('Absolute local database path required.');
 let existing=cachedReader;
 try{existing||=await openDatabase(file);databaseBuildTime(existing,now.getTime());}catch{existing=null;}
 if(existing&&month(new Date(databaseBuildTime(existing,now.getTime())))===month(now))return existing;
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const temporary=file+'.'+randomUUID()+'.tmp';
 try{
  const response=await fetcher(`https://download.db-ip.com/free/dbip-city-lite-${month(now)}.mmdb.gz`,{redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok||!response.body)throw Error('Database download unavailable.');
  await pipeline(Readable.fromWeb(response.body),byteLimit(100*1024*1024),createGunzip(),byteLimit(200*1024*1024),createWriteStream(temporary,{flags:'wx',mode:0o600}));
  const reader=await openDatabase(temporary),built=databaseBuildTime(reader,now.getTime());
  if(reader.metadata.databaseType!=='DBIP-City-Lite'||month(new Date(built))!==month(now))throw Error('Unexpected database release.');
  await rename(temporary,file);
  return reader;
 }catch(error){
  if(existing)return existing;
  throw error;
 }finally{await rm(temporary,{force:true});}
}

export async function createManagedLocationResolver(env={},dependencies={}){
 if(env.HERO_PLAYER_GEO_ENABLED!=='1'||env.HERO_GEOIP_PROVIDER!=='dbip-lite')return createLocationResolver(env,dependencies.openDatabase);
 let reader=null,current=await createLocationResolver({}),flight=null;
 const file=env.HERO_GEOIP_DATABASE;
 async function refresh(){
  if(flight)return flight;
  flight=(async()=>{
   try{
    reader=await refreshDbipDatabase({file,cachedReader:reader,...dependencies});
    current=await createLocationResolver(env,async()=>reader);
   }catch{current={available:false,reason:'configuration_unavailable',lookup:()=>null};}
  })();
  try{await flight;}finally{flight=null;}
 }
 await refresh();
 // Keep an existing instance current even without another deployment.
 const timer=setInterval(()=>void refresh(),24*3600000);timer.unref();
 return {get available(){try{return current.available&&!!databaseBuildTime(reader);}catch{return false;}},get reason(){return this.available?null:'configuration_unavailable';},get buildDate(){return current.buildDate;},get proxyMode(){return current.proxyMode;},lookup(req){return this.available?current.lookup(req):null;},refresh,close(){clearInterval(timer);}};
}
