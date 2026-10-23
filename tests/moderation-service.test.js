import test from 'node:test';
import assert from 'node:assert/strict';
import {createModerationService,assertModeratedText,MODERATION_RETENTION_MS} from '../moderation-service.js';
const ids={'HA-AAAAAAAAAAAAAAAA':'a','HA-BBBBBBBBBBBBBBBB':'b','HA-CCCCCCCCCCCCCCCC':'c'};
const make=(options={})=>createModerationService({resolvePlayer:id=>ids[id],publicPlayer:id=>({playerId:Object.keys(ids).find(k=>ids[k]===id),name:id}),evidence:(actor,target)=>actor==='a'&&target==='b'?{kind:'room',messages:[{message:'server evidence'}]}:null,isAdmin:user=>user?.sub==='admin',...options});
const report={playerId:'HA-BBBBBBBBBBBBBBBB',reason:'harassment',details:'Please review',context:{message:'CLIENT FORGERY'}};
test('blocks are directional to manage but symmetric to enforce, persistent and failure atomic',async()=>{
 let saved;const s=make({persist:async state=>saved=state});await s.block('a',report.playerId);assert.equal(s.blocked('a','b'),true);assert.equal(s.blocked('b','a'),true);assert.equal(s.state('b').blocked.length,0);
 const restored=make();restored.restore(saved);assert.equal(restored.blocked('b','a'),true);await restored.unblock('a',report.playerId);assert.equal(restored.blocked('a','b'),false);
 const broken=make({persist:async()=>{throw Error('database failed')}});await assert.rejects(broken.block('a',report.playerId),/database failed/);assert.equal(broken.blocked('a','b'),false);
});
test('reports store server evidence, return no identity/evidence, and require known interaction',async()=>{
 const s=make();const receipt=await s.report('a',report);assert.deepEqual(Object.keys(receipt).sort(),['createdAt','id','reason','status']);assert.equal(s.state('b').reports.length,0);
 assert.throws(()=>s.adminList({sub:'a'}),{status:403});const record=s.adminList({sub:'admin'}).reports[0];assert.equal(record.evidence.messages[0].message,'server evidence');assert.equal(JSON.stringify(record).includes('CLIENT FORGERY'),false);
 await assert.rejects(s.report('a',{...report,playerId:'HA-CCCCCCCCCCCCCCCC'}),{status:403});await assert.rejects(s.report('a',{...report,reason:'invalid'}),{status:400});
 assert.equal((await s.report('a',report)).id,receipt.id);
});
test('review requires admin, valid terminal decision and a reason, durable with no repeat overwrite',async()=>{
 const s=make();const receipt=await s.report('a',report);assert.throws(()=>s.review({sub:'a'},{reportId:receipt.id,status:'actioned',note:'ban'}),{status:403});
 await assert.rejects(s.review({sub:'admin'},{reportId:receipt.id,status:'actioned',note:''}),{status:400});
 await s.review({sub:'admin'},{reportId:receipt.id,status:'dismissed',note:'No violation found'});assert.equal(s.state('a').reports[0].status,'dismissed');
 await assert.rejects(s.review({sub:'admin'},{reportId:receipt.id,status:'actioned',note:'overwrite'}),{status:409});
});
test('spam limits and retention bound evidence storage',async()=>{
 let time=1000;const s=make({now:()=>time});for(let i=0;i<10;i++)await s.report('a',report);assert.throws(()=>s.report('a',report),{status:429});
 time+=MODERATION_RETENTION_MS;await s.prune();assert.equal(s.adminList({sub:'admin'}).reports.length,0);assert.equal(s.snapshot().reports.length,0);
});
test('basic text filter normalizes invisible bypass, bounds names and does not claim broad moderation',()=>{
 assert.equal(assertModeratedText(' Hello '),'Hello');assert.throws(()=>assertModeratedText('f\u200buck'),{status:400});assert.throws(()=>assertModeratedText('x'.repeat(25),{kind:'name'}),{status:400});assert.throws(()=>assertModeratedText('hello\u0000world'),{status:400});assert.equal(assertModeratedText('Scunthorpe'),'Scunthorpe');
});
test('admin queue prioritizes oldest open reports so historical reports cannot starve',async()=>{
 let time=1;const s=make({now:()=>time});const first=await s.report('a',report);time+=3600001;const second=await s.report('a',{...report,reason:'spam'});
 assert.equal(s.adminList({sub:'admin'}).reports[0].id,first.id);await s.review({sub:'admin'},{reportId:first.id,status:'dismissed',note:'reviewed'});assert.equal(s.adminList({sub:'admin'}).reports[0].id,second.id);
});

test('unacknowledged unblock never permits peer communication and failed persistence preserves block',async()=>{
 let fail=false,release;const s=make({persist:async()=>{if(fail)await new Promise((resolve,reject)=>{release=()=>reject(Error('lost acknowledgment'))})}});
 await s.block('a',report.playerId);fail=true;const pending=s.unblock('a',report.playerId);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(s.blocked('a','b'),true);release();await assert.rejects(pending,/lost acknowledgment/);assert.equal(s.blocked('a','b'),true);
});
