import test from 'node:test';
import assert from 'node:assert/strict';
import {clientPublicAddress,trustedNetworks,coarseLocation,createLocationResolver} from '../player-location.js';
const req=(peer,forwarded)=>({socket:{remoteAddress:peer},headers:{'x-forwarded-for':forwarded,'cf-ipcity':'forged','x-real-ip':'8.8.8.8'}});
test('untrusted peers cannot forge forwarded, real-IP or city headers',()=>{
 assert.equal(clientPublicAddress(req('1.1.1.1','8.8.8.8')),'1.1.1.1');
 assert.equal(clientPublicAddress(req('::ffff:1.1.1.1','8.8.8.8')),'1.1.1.1');
});
test('trusted proxy chains stop at closest untrusted hop, not attacker-controlled leftmost IP',()=>{
 const networks=trustedNetworks('10.20.0.0/16, 2001:4860::/32');
 assert.equal(clientPublicAddress(req('10.20.0.1','8.8.8.8, 1.1.1.1, 10.20.0.2'),networks),'1.1.1.1');
 assert.equal(clientPublicAddress(req('2001:4860::1','2606:4700:4700::1111'),networks),'2606:4700:4700::1111');
 for(const value of [undefined,'','not-ip','8.8.8.8, invalid',Array(22).fill('8.8.8.8').join(','),'x'.repeat(2050)])assert.equal(clientPublicAddress(req('10.20.0.1',value),networks),null);
 for(const cidr of ['0.0.0.0/0','::/0','::ffff:10.0.0.0/8','10.0.0.1','*','broken'])assert.throws(()=>trustedNetworks(cidr));
});
test('private, loopback, reserved, multicast and malformed IPs are never looked up',()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.1','169.254.1.1','100.64.1.1','192.0.2.1','224.0.0.1','::1','::','fc00::1','fe80::1','2001:db8::1','fe80::1%eth0','8.8.8.8:80','010.0.0.1'])assert.equal(clientPublicAddress(req(ip)),null,ip);
});
test('only bounded country/city are projected; coordinates and IP are dropped',()=>{
 assert.deepEqual(coarseLocation({country:{iso_code:'TR'},city:{names:{tr:' İzmir\u0000\n ',en:'Izmir'}},location:{latitude:38,longitude:27},ip:'secret'}),{country:'TR',city:'İzmir'});
 assert.deepEqual(coarseLocation({country:{iso_code:'TR'}}),{country:'TR',city:null});
 assert.equal(coarseLocation({country:{iso_code:'bad'}}),null);
});
test('resolver is off by default; local database missing/stale/incorrect config fails without network or exceptions',async()=>{
 let opens=0;const open=async()=>{opens++;throw Error('path secret');};
 assert.equal((await createLocationResolver({},open)).reason,'disabled');assert.equal(opens,0);
 assert.equal((await createLocationResolver({HERO_PLAYER_GEO_ENABLED:'1'},open)).available,false);assert.equal(opens,0);
 const env={HERO_PLAYER_GEO_ENABLED:'1',HERO_GEOIP_DATABASE:'/fixture/City.mmdb'};
 assert.equal((await createLocationResolver(env,open)).reason,'configuration_unavailable');
 for(const metadata of [{databaseType:'City',buildEpoch:new Date(0)},{databaseType:'Country',buildEpoch:new Date()}])assert.equal((await createLocationResolver(env,async()=>({metadata}))).available,false);
 const lookups=[];const resolver=await createLocationResolver(env,async()=>({metadata:{databaseType:'GeoLite2-City',buildEpoch:new Date()},get:ip=>{lookups.push(ip);return {country:{iso_code:'TR'},city:{names:{en:'Manisa'}},location:{latitude:99}};}}));
 assert.deepEqual(resolver.lookup(req('1.1.1.1')),{country:'TR',city:'Manisa'});assert.equal(resolver.lookup(req('127.0.0.1')),null);assert.deepEqual(lookups,['1.1.1.1']);
});
