import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// No database / RAM-wallet previews must not exercise a production money bypass.
// Bot cosmetics and decision rules remain covered by pure bot tests. Paid bot
// admission -> arena -> settlement HTTP coverage requires an isolated real DB.
export async function assertBotStorageUnavailable(request,authToken,extra={}){
 const identity={authToken};
 const before=await request('/api/wallet',identity);assert.equal(before.status,200);
 const body={...identity,difficulty:'easy',botTermsVersion:'bot-fixed-v1',requestId:randomUUID(),...extra};
 for(let attempt=0;attempt<2;attempt++){
  const denied=await request('/api/bot',body);assert.equal(denied.status,503,JSON.stringify(denied));
  assert.equal(denied.body.room,undefined);assert.equal(denied.body.token,undefined);
 }
 assert.deepEqual((await request('/api/wallet',identity)).body,before.body,'denied and retried bot entry cannot debit RAM gold');
 // A rejected entry must not leave an active bot seat that blocks other rooms.
 const fresh=await request('/api/create',identity);assert.equal(fresh.status,200,JSON.stringify(fresh));
 assert.equal(fresh.body.room.mode,'friend');assert.equal(fresh.body.room.phase,'waiting');
 assert.equal(fresh.body.room.entryPaid,false);assert.equal(fresh.body.room.players[1],null);
 assert.deepEqual((await request('/api/wallet',identity)).body,before.body,'creating a waiting friend room is still free');
}
