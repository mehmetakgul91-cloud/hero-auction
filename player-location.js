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
// Render documents that its public edge overwrites CF-Connecting-IP. This
// explicit mode is only valid for Render web services, never a generic proxy.
// https://render.com/articles/host-pocketbase-on-render
export function renderClientPublicAddress(req,env={}){
 if(env.RENDER!=='true'||env.RENDER_SERVICE_TYPE!=='web')return null;
 const peer=address(req?.socket?.remoteAddress);
 if(!peer||!['private','loopback','uniqueLocal'].includes(peer.range()))return null;
 if(typeof req?.headers?.['cf-ray']!=='string'||! /^[a-f0-9]{16,32}-[A-Z]{3}$/i.test(req.headers['cf-ray']))return null;
 const ip=address(req?.headers?.['cf-connecting-ip']);
 // Cloudflare uses this shared address for cross-zone Worker subrequests.
 if(!ip||ip.range()!=='unicast'||ip.toString()===address('2a06:98c0:3600::103').toString())return null;
 return ip.toString();
}
export function databaseBuildTime(reader,now=Date.now()){
 const built=reader?.metadata?.buildEpoch instanceof Date?reader.metadata.buildEpoch.getTime():Number(reader?.metadata?.buildEpoch)*1000;
 if(!/City/.test(reader?.metadata?.databaseType||'')||!Number.isFinite(built)||now-built>90*86400000||built>now+86400000)throw Error('City database is unavailable or stale.');
 return built;
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
  const mode=env.HERO_GEOIP_PROXY_MODE||'cidr';
  if(!['cidr','render-cloudflare'].includes(mode)||mode==='render-cloudflare'&&(env.RENDER!=='true'||env.RENDER_SERVICE_TYPE!=='web'))throw Error('Invalid proxy mode.');
  const file=env.HERO_GEOIP_DATABASE;
  if(!file||!path.isAbsolute(file))throw Error('Local database required.');
  const reader=await openDatabase(file);
  // Refuse a stale/incorrect database. Replace the local file and restart to refresh.
  const built=databaseBuildTime(reader);
  return {get available(){try{databaseBuildTime(reader);return true;}catch{return false;}},reason:null,buildDate:new Date(built).toISOString(),proxyMode:mode,lookup(req){try{databaseBuildTime(reader);const ip=mode==='render-cloudflare'?renderClientPublicAddress(req,env):clientPublicAddress(req,networks);return ip?coarseLocation(reader.get(ip)):null;}catch{return null;}}};
 }catch{return {available:false,reason:'configuration_unavailable',lookup:()=>null};}
}
export async function preflightPlayerLocations(database){
 if(!database)return false;
 try{await database.query('SELECT account_id,session_id,country,city FROM hero_auction_player_session_locations LIMIT 0');return true;}catch{return false;}
}
