import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationDraft} from '../public/preparation-draft.js';
import {buildDefaultFormation} from '../public/preparation-formation.js';
const team=['tank','fighter','energy','assassin','support'].map((role,index)=>({id:'hero-'+index,role}));
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
const changed=()=>({...buildDefaultFormation(team),lanes:['back','front','back','front','front']});

test('row edits serialize, preserve latest edit through an older save, then clear only pending cache',async()=>{
 const storage=memory(),calls=[];let release;
 const draft=createPreparationDraft({matchKey:'room:seat:match1',team,storage,save:async value=>{calls.push(value);if(calls.length===1)await new Promise(r=>release=r)}});
 draft.save(buildDefaultFormation(team));await Promise.resolve();
 draft.save(changed());assert.deepEqual(draft.pending(),changed());
 release();await draft.flush();assert.equal(calls.length,2);assert.deepEqual(calls[1].lanes,changed().lanes);assert.equal(draft.pending(),null);
});

test('failed/in-flight save survives refresh only for the same match, seat and exact roster',async()=>{
 const storage=memory();let errors=0;
 const options={matchKey:'room:seat:match1',team,storage,save:async()=>{throw Error('offline')},onError:()=>errors++};
 const draft=createPreparationDraft(options);await draft.save(changed());assert.equal(errors,1);
 assert.deepEqual(createPreparationDraft(options).pending(),changed());
 assert.equal(createPreparationDraft({...options,matchKey:'room:seat:match2'}).pending(),null);
 assert.equal(createPreparationDraft({...options,matchKey:'room:otherseat:match1'}).pending(),null);
 assert.equal(createPreparationDraft({...options,team:[...team].reverse()}).pending(),null);
 const restored=createPreparationDraft({...options,save:async()=>{}});await restored.save(restored.pending());assert.equal(restored.pending(),null);
});

test('bad storage and malformed pending saves do not break defaults or mutate saved formations',async()=>{
 const storage=memory();storage.setItem('hero-auction-formation','legacy-read-only');storage.setItem('hero-auction-preparation-draft','{bad');
 const draft=createPreparationDraft({matchKey:'match',team,storage,save:async()=>{}});assert.equal(draft.pending(),null);
 await assert.rejects(draft.save({...changed(),positions:[0,0,2,3,4]}));
 await draft.save(changed());assert.equal(storage.getItem('hero-auction-formation'),'legacy-read-only');
 const blocked=createPreparationDraft({matchKey:'match',team,storage:{getItem(){throw Error()},setItem(){throw Error()}},save:async()=>{}});
 assert.equal(blocked.pending(),null);await blocked.save(changed());
});
