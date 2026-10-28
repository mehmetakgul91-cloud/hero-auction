import {isIP} from 'node:net';
import path from 'node:path';
import ipaddr from 'ipaddr.js';
import {open} from 'maxmind';

// No HTTP lookup, IP cache, raw header logging or coordinate output.
function address(value){
 if(typeof value!=='string'||!isIP(value)||value.includes('%'))return null;
 try{return ipaddr.process(value);}catch{return null;}
}
export function trustedNetworks(value=''){
 if(!value.trim())return [];
 return value.split(',').map(part=>{
  const raw=part.trim();
  if(!raw.includes('/'))throw Error('Proxy trust requires explicit CIDRs.');
  const [ip,bits]=ipaddr.parseCIDR(raw);
  if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress()||bits<(ip.kind()==='ipv4'?8:32))throw Error('Proxy CIDR is too broad or mapped.');
  return [ip,bits];
 });
}
export function clientPublicAddress(req,networks=[]){
 const peer=address(req?.socket?.remoteAddress);if(!peer)return null;
 const trusted=ip=>networks.some(([network,bits])=>ip.kind()===network.kind()&&ip.match(network,bits));
 let selected=peer;
 if(trusted(peer)){
  const raw=req?.headers?.['x-forwarded-for'];
  if(typeof raw!=='string'||raw.length>2048)return null;
  const hops=raw.split(',');if(hops.length>20)return null;
  for(let i=hops.length-1;i>=0;i--){
   selected=address(hops[i].trim());if(!selected)return null;
   if(!trusted(selected))break;
  }
  if(trusted(selected))return null;
 }
 return selected.range()==='unicast'?selected.toString():null;
}
export function coarseLocation(record){
 const country=record?.country?.iso_code;
 if(typeof country!=='string'||!/^[A-Z]{2}$/.test(country))return null;
 const raw=record?.city?.names?.tr||record?.city?.names?.en;
 const city=typeof raw==='string'?raw.normalize('NFC').replace(/[\p{C}]/gu,'').trim().slice(0,100):'';
 return {country,city:city||null};
}
export async function createLocationResolver(env={},openDatabase=open){
 if(env.HERO_PLAYER_GEO_ENABLED!=='1')return {available:false,reason:'disabled',lookup:()=>null};
 try{
  const networks=trustedNetworks(env.HERO_TRUSTED_PROXY_CIDRS||'');
  const file=env.HERO_GEOIP_DATABASE;
  if(!file||!path.isAbsolute(file))throw Error('Local database required.');
  const reader=await openDatabase(file);
  // Refuse a stale/incorrect database. Replace the local file and restart to refresh.
  const built=reader.metadata?.buildEpoch instanceof Date?reader.metadata.buildEpoch.getTime():Number(reader.metadata?.buildEpoch)*1000;
  if(!/City/.test(reader.metadata?.databaseType||'')||!Number.isFinite(built)||Date.now()-built>90*86400000||built>Date.now()+86400000)throw Error('City database is unavailable or stale.');
  return {available:true,reason:null,lookup(req){try{const ip=clientPublicAddress(req,networks);return ip?coarseLocation(reader.get(ip)):null;}catch{return null;}}};
 }catch{return {available:false,reason:'configuration_unavailable',lookup:()=>null};}
}
export async function preflightPlayerLocations(database){
 if(!database)return false;
 try{await database.query('SELECT account_id,session_id,country,city FROM hero_auction_player_session_locations LIMIT 0');return true;}catch{return false;}
}
