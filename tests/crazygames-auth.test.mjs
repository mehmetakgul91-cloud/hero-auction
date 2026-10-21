import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHmac} from 'node:crypto';
import {verifyCrazyGamesToken} from '../crazygames-auth.js';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const now=1700000000000;
const payload={userId:'player_123',gameId:'12345',username:'Player.One',iat:now/1000-10,exp:now/1000+3600};
const options={now,fetchKey:async()=>publicKey.export({type:'spki',format:'pem'})};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(claims=payload,header={alg:'RS256'},key=privateKey){const data=encode(header)+'.'+encode(claims);return data+'.'+sign('RSA-SHA256',Buffer.from(data),key).toString('base64url')}

test('verified identity is stable across devices and token refresh; names can change',async()=>{
 const first=await verifyCrazyGamesToken(token(),options);
 const second=await verifyCrazyGamesToken(token({...payload,username:'New.Name',iat:payload.iat+5}),options);
 assert.equal(first.sub,'crazygames:12345:player_123');assert.equal(first.sub,second.sub);assert.equal(second.name,'New.Name');
 const other=await verifyCrazyGamesToken(token({...payload,gameId:'other-game'}),options);
 assert.notEqual(first.sub,other.sub);
});
test('rejects forged signatures, algorithm confusion and untrusted keys',async()=>{
 const other=generateKeyPairSync('rsa',{modulusLength:2048});
 const data=encode({alg:'HS256'})+'.'+encode(payload);
 const hmac=data+'.'+createHmac('sha256','anything').update(data).digest('base64url');
 for(const input of [token(payload,{alg:'none'}),hmac,token(payload,{alg:'RS256'},other.privateKey),token()+'.extra','x'.repeat(9000),token(payload,{alg:'RS256',crit:['unknown']})]){
  await assert.rejects(verifyCrazyGamesToken(input,options),{status:401});
 }
});
test('rejects expired, future, malformed and wrong-game claims before loading key',async()=>{
 for(const claims of [{...payload,exp:now/1000},{...payload,iat:now/1000+60},{...payload,nbf:now/1000+1},{...payload,exp:'9999999999'},{...payload,userId:'../user'},{...payload,userId:''},{...payload,gameId:null}]){
  await assert.rejects(verifyCrazyGamesToken(token(claims),{now,fetchKey:()=>assert.fail('invalid claims fetched a key')}),{status:401});
 }
 await assert.rejects(verifyCrazyGamesToken(token(),{...options,gameId:'different-game'}),{status:401});
 await assert.rejects(verifyCrazyGamesToken(token(),{...options,fetchKey:async()=>{throw Error('offline')}}),{status:401});
});
