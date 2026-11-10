// Temporary transport compatibility for the old Android APK's OkHttp 4.12.0
// client. This is NOT application identity or authorization: room/account token
// checks still apply. Unknown clients fail closed to explicit match selection.
export function commanderSelectionClient(request={}, {body={},searchParams}={}){
 const headers=request?.headers||{};
 const advertised=Object.hasOwn(headers,'x-hero-match-commander-selection')||Object.hasOwn(body||{},'matchCommanderSelection')||searchParams?.has('matchCommanderSelection');
 if(advertised)return 'selection'; // Invalid/zero versions must not opt out.
 if(Object.hasOwn(headers,'origin')||Object.keys(headers).some(name=>name.toLowerCase().startsWith('sec-fetch-')))return 'selection';
 return headers['user-agent']==='okhttp/4.12.0'?'legacy':'selection';
}

// Durable jobs can install snapshots taken before a concurrent capability
// upgrade. Preserve only the same authenticated seat, including its rematch.
export function preserveCommanderSelectionCapability(current,replacement){
 if(!current||!replacement||current.code!==replacement.code)return replacement;
 for(let seat=0;seat<2;seat++){
  const old=current.players?.[seat],next=replacement.players?.[seat];
  if(old?.matchCommanderSelection!==1||typeof old.accountId!=='string'||!old.accountId||typeof old.token!=='string'||!old.token||old.accountId!==next?.accountId||old.token!==next?.token)continue;
  next.matchCommanderSelection=1;
  const sync=replacement.battleSync;
  if(sync&&!sync.result&&sync.commanderChoiceSources?.[seat]==='legacy'){
   sync.commanderChoices[seat]=null;sync.commanderChoiceSources[seat]=null;
  }
 }
 return replacement;
}
