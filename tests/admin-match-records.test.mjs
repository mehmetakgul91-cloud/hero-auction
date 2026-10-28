import test from 'node:test';
import assert from 'node:assert/strict';
import {listAdminMatches,readAdminMatch,matchIdentity} from '../admin-match-records.js';
import {createModerationService,MODERATION_RETENTION_MS} from '../moderation-service.js';
const created=Date.parse('2026-10-28T20:00:00Z'),id=`123:2:${created}`;
const record={id,at:created+60000,mode:'friend',universe:'mixed',participants:[{id:'a',name:'İpek <img>',score:3,token:'secret'},{id:'b',name:'Bora',score:1}],winner:0,rankChange:[16,-16],internalSecret:'secret'};
const records=new Map([[id,record]]);
const room={code:'123',matchNumber:2,created,players:[{accountId:'a',name:'İpek',token:'secret'},{accountId:'b',name:'Bora',token:'secret'}],history:['İpek 2 kredi teklif etti.'],chat:[{name:'İpek',message:'önceki maç',time:created-1},{name:'Bora',message:'merhaba',time:created+1,token:'secret'}],battleSync:{secret:'secret'},matchSettled:true,phase:'finished'};
test('match listing filters literal player identifiers and Turkey calendar dates, then paginates',()=>{
 const all=new Map(Array.from({length:30},(_,i)=>[String(i),{...record,id:`123:${i+1}:${created}`,at:created+i}]));
 const page=listAdminMatches({records:all,request:{days:1,search:'ipek',offset:25},now:created+300000});assert.equal(page.matches.length,5);assert.equal(page.pagination.total,30);assert.equal(page.pagination.hasMore,false);
 assert.equal(listAdminMatches({records,request:{search:'%_'},now:created+300000}).matches.length,0);
 assert.equal(listAdminMatches({records,request:{days:1},now:Date.parse('2026-10-28T21:01:00Z')}).matches.length,0);
 for(const request of [{offset:-1},{offset:1.5},{days:999}])assert.throws(()=>listAdminMatches({records,request}),e=>e.status===400);
 assert.doesNotMatch(JSON.stringify(page),/secret|token/);
});
test('detail projects allowed fields only and does not mix rematches sharing a room code',()=>{
 const before=structuredClone(room),rooms=new Map([['123',room]]);
 const detail=readAdminMatch({records,rooms,request:{matchId:id}});assert.equal(detail.room.chat.length,1);assert.equal(detail.room.chat[0].message,'merhaba');assert.equal(detail.record.winner,0);assert.doesNotMatch(JSON.stringify(detail),/secret|token|battleSync/);assert.deepEqual(room,before);
 rooms.set('123',{...room,matchNumber:3,created:created+100000});const old=readAdminMatch({records,rooms,request:{matchId:id}});assert.equal(old.room,null);assert.equal(old.detailAvailable,false);assert.equal(old.record.id,id);
 assert.throws(()=>readAdminMatch({records,rooms,request:{matchId:'123'}}),e=>e.status===400);
 assert.throws(()=>readAdminMatch({records:new Map(),rooms:new Map(),request:{matchId:id}}),e=>e.status===404);
 assert.equal(matchIdentity(room),id);
});
test('old complaint joins by room creation and participants; saved proof survives room expiry',()=>{
 const report={id:'report',reporter:'a',target:'b',createdAt:created+50000,evidence:{kind:'room',code:'123',created,names:['İpek','Bora'],chat:[{name:'Bora',message:'saklanan kanıt',time:created+30000}],token:'secret'}};
 const view=readAdminMatch({records,rooms:new Map(),request:{reportId:'report'},report});assert.equal(view.record.id,id);assert.equal(view.reportEvidence.chat[0].message,'saklanan kanıt');assert.equal(view.room,null);assert.doesNotMatch(JSON.stringify(view),/secret|token/);
 const unrelated=readAdminMatch({records,rooms:new Map(),report:{...report,target:'someone-else'},request:{}});assert.equal(unrelated.record,null);
 const future=readAdminMatch({records:new Map(),rooms:new Map(),report:{...report,evidence:{...report.evidence,matchId:id}},request:{}});assert.equal(future.record,null);assert.equal(future.reportEvidence.chat.length,1);
 const friend=readAdminMatch({records,rooms:new Map(),request:{},report:{...report,evidence:{kind:'friend',playerId:'P-1',name:'Bora'}}});assert.equal(friend.record,null);assert.equal(friend.reportEvidence.kind,'friend');
});
test('direct complaint lookup enforces admin authorization and the existing retention boundary',()=>{
 let now=created;const service=createModerationService({now:()=>now,isAdmin:u=>u?.owner===true});service.restore({reports:[{id:'report',createdAt:created-1,evidence:{kind:'friend'}}]});
 assert.throws(()=>service.adminGet({},'report'),e=>e.status===403);const result=service.adminGet({owner:true},'report');result.evidence.kind='mutated';assert.equal(service.adminGet({owner:true},'report').evidence.kind,'friend');
 now+=MODERATION_RETENTION_MS;assert.throws(()=>service.adminGet({owner:true},'report'),e=>e.status===404);
});
