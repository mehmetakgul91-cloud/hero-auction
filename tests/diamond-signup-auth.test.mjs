import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const handlers=source.slice(source.indexOf('async function apiAction(url,b,requestContext)'),source.indexOf('const mime='));
function fixture(extraClaims={},ok=true){
 const calls=[];
 const claims={sub:'verified-google-subject',aud:'isolated-google-client',iss:'https://accounts.google.com',exp:String(Math.floor(Date.now()/1000)+1000),email_verified:'true',name:'Member',email:'member@example.test',...extraClaims};
 const context=vm.createContext({previewGuestMode:false,GOOGLE_CLIENT_ID:'isolated-google-client',AbortSignal,
  fetch:async()=>{calls.push('verify-google');return{ok,json:async()=>claims}},
  verifyCrazyGamesToken:async()=>{calls.push('verify-crazygames');return{sub:'crazygames:game:member',name:'CG Member'}},
  registerVerifiedDiamondMember:async(user,provider)=>calls.push(['signup',user.sub,provider]),
  rememberDisplayName:async user=>calls.push(['remember',user.sub]),goldBalance:async()=>500,signLogin:()=> 'signed-session',
  readLogin:()=>({sub:'existing-google-member',name:'Existing'}),assertModeratedText:name=>name,crypto:{randomUUID:()=> 'anonymous-id'},rooms:new Map(),
  error:(message,status=400)=>{throw Object.assign(Error(message),{status})}
 });
 vm.runInContext(handlers,context);
 return{calls,run:(path,body={})=>context.apiAction(path,{credential:'x'.repeat(120),...body})};
}

test('only successful Google verification invokes fixed server-owned membership hook before profile creation',async()=>{
 const f=fixture();await f.run('/api/auth/google',{provider:'crazygames',accountId:'forged',sub:'forged',amount:999999,verified:true});
 assert.deepEqual(f.calls,['verify-google',['signup','verified-google-subject','google'],['remember','verified-google-subject']]);
});
test('invalid Google claims never reach registration or persistent profile creation',async()=>{
 for(const claims of [{aud:'forged'},{iss:'forged'},{sub:null},{email_verified:'false'},{exp:'1'}]){
  const f=fixture(claims);await assert.rejects(f.run('/api/auth/google'),e=>e.status===401);assert.deepEqual(f.calls,['verify-google']);
 }
 const unavailable=fixture({},false);await assert.rejects(unavailable.run('/api/auth/google'),e=>e.status===401);assert.deepEqual(unavailable.calls,['verify-google']);
});
test('guest, verified CrazyGames and session refresh cannot trigger Google signup gift',async()=>{
 for(const path of ['/api/auth/guest','/api/auth/crazygames','/api/auth/check']){
  const f=fixture();await f.run(path,{provider:'google',verified:true,amount:10,authToken:'opaque'});
  assert.equal(f.calls.some(item=>Array.isArray(item)&&item[0]==='signup'),false,path);
 }
});
test('membership hook is not exposed as an HTTP claim/grant route',()=>{
 assert.doesNotMatch(source,/url==='\/api\/[^']*(?:signup-bonus|gift|claim-diamonds|mint-diamonds)'/);
 assert.equal((source.match(/await registerVerifiedDiamondMember\(user,'google'\)/g)||[]).length,1);
 assert.doesNotMatch(source,/registerVerifiedDiamondMember\(user,'crazygames'\)/);
});
