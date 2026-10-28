import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {requireModerationForInteraction} from '../moderation-availability.js';
test('missing block state fails closed on peers while solo and active match actions remain available',()=>{
 for(const route of ['/api/friends','/api/friends/presence','/api/friend/add','/api/friend/accept','/api/friend/invitations','/api/friend/invite/respond','/api/join','/api/match','/api/rematch','/api/chat','/api/spectate','/api/spectate/list']){assert.throws(()=>requireModerationForInteraction(false,route),e=>e.status===503);assert.doesNotThrow(()=>requireModerationForInteraction(true,route))}
 for(const route of ['/api/bot','/api/create','/api/state','/api/bid','/api/pass','/api/commander/get','/api/battle-auction-preview'])assert.doesNotThrow(()=>requireModerationForInteraction(false,route));
});
test('isolated moderation storage failure does not mark base database unavailable or report ready',async()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const body=source.slice(source.indexOf('async function initializeModeration()'),source.indexOf('let databaseReady=false;'));
 const context=vm.createContext({database:{query:async()=>{throw Error('table unavailable')}},databaseReady:true,moderationReady:false,moderation:{restore(){throw Error('must not restore')}},console:{log(){},error(){}}});await vm.runInContext(body+';initializeModeration()',context);assert.equal(context.databaseReady,true);assert.equal(context.moderationReady,false);
 assert.match(source,/requireModerationForInteraction\(moderationReady,url\)/);assert.match(source,/chat:\(r\.chat\|\|\[\]\)\.filter\(message=>moderationReady&&seat>=0&&/);
});
test('ambiguous moderation write disables peers and later writes without disabling base database',async()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const body=source.slice(source.indexOf('const moderation=createModerationService('),source.indexOf('async function moderationApi('));
 let options,writes=0;const context=vm.createContext({database:{query:async()=>{writes++;throw Error('lost response')}},databaseReady:true,moderationReady:true,createModerationService:value=>{options=value;return{}},error:(message,status)=>{throw Object.assign(Error(message),{status})},console:{error(){}},ADMIN_GOOGLE_EMAIL:''});vm.runInContext(body,context);
 await assert.rejects(options.persist({version:1,blocks:[],reports:[]}),/lost response/);assert.equal(context.moderationReady,false);assert.equal(context.databaseReady,true);
 await assert.rejects(options.persist({version:1,blocks:[],reports:[]}),e=>e.status===503);assert.equal(writes,1);
});
test('queued peer admission rechecks store availability after earlier work fails',async()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const body=source.slice(source.indexOf('async function api(url,b,requestContext)'),source.indexOf('async function apiAction(url,b,requestContext)'));
 const context=vm.createContext({paidEntryMaintenance:{beginAdmission:()=>()=>{}},requireModerationForInteraction,moderationReady:true,readLogin:()=>({sub:'a',name:'A'}),friends:{register:async()=>{context.moderationReady=false},afterMutations:task=>task()},error:(message,status)=>{throw Object.assign(Error(message),{status})},apiAction:()=>{throw Error('must not admit')},roomInvites:{items:new Map()},rooms:new Map()});vm.runInContext(body,context);
 await assert.rejects(context.api('/api/match',{authToken:'local'}),e=>e.status===503);
 const invitation=source.slice(source.indexOf('async function invitationApi('),source.indexOf('async function api(url,b,requestContext)'));
 assert.match(invitation,/friends\.afterMutations\(async\(\)=>\{\s*requireModerationForInteraction\(moderationReady,url\)/);
});
