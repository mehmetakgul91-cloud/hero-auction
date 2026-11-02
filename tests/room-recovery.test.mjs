import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccountRoom,roomRecoveryStage} from '../room-recovery.js';
import {roomResumePath} from '../public/room-resume.js';
const room=()=>({code:'123',created:100,matchNumber:1,phase:'auction',players:[{accountId:'a',token:'secret-a',team:[]},{accountId:'b',token:'secret-b',team:[]}]});
const pointer={code:'123',created:100,matchNumber:1,seat:0};
function resolve(r,extra={}){return resolveAccountRoom({accountId:'a',pointer,rooms:new Map([[r.code,r]]),...extra});}
test('same account recovers exact existing room and token without modifying state',()=>{const r=room(),before=JSON.stringify(r);assert.deepEqual(resolve(r),{room:r,seat:0,stage:'auction'});assert.equal(JSON.stringify(r),before);});
test('account switch, guessed seat, stale rematch and detached pointer cannot recover',()=>{for(const extra of [{accountId:'other'},{pointer:{...pointer,seat:1}},{pointer:{...pointer,created:99}},{pointer:{...pointer,matchNumber:2}},{pointer:{detached:true}},{pointer:null}])assert.equal(resolve(room(),extra),null);});
test('ambiguous rooms fail closed rather than choosing arbitrary wallet match',()=>assert.throws(()=>resolve(room(),{pointer:{ambiguous:true}}),e=>e.status===409));
test('formation and ongoing arena recover actual stage, closed match stays result',()=>{const r=room();r.phase='finished';r.players.forEach(p=>p.team=Array(5).fill({}));assert.equal(roomRecoveryStage(r),'formation');r.battleSync={result:{live:true}};assert.equal(roomRecoveryStage(r),'arena');for(const state of [{matchSettled:true},{idleClosed:{}},{disconnectForfeit:{winner:1}},{cancelled:{}}])assert.equal(roomRecoveryStage({...r,...state}),'result');});
test('resume links are encoded, preserve token and never admit or debit',()=>{const path=roomResumePath({room:room(),token:'x&unsafe',resumeStage:'arena'}),url=new URL(path,'https://example.test');assert.equal(url.pathname,'/battle-preview.html');assert.equal(url.searchParams.get('auctionToken'),'x&unsafe');assert.equal(url.searchParams.get('room'),'arena');assert.equal(url.searchParams.get('auctionCode'),'123');});
test('terminal snapshots never navigate even with stale arena stage',()=>{for(const state of [{idleClosed:{}},{forfeit:{}},{cancellation:{}}])assert.equal(roomResumePath({room:{...room(),...state},token:'x',resumeStage:'arena'}),null);assert.equal(roomResumePath({room:room(),token:'x',resumeStage:'result'}),null);});
