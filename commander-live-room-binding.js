// Experimental room-to-live-session admission. Does not activate a live battle.
// A precomputed replay is never a valid source of incremental hero state.
export function deriveLiveArenaRoomBinding(room){
 if(!room||room.mode==='bot'||room.phase!=='finished'||!room.battleSync?.result||!room.battleSync?.commanderInput)throw Error('Room is not ready for live arena preparation');
 if(typeof room.code!=='string'||!room.code||!Array.isArray(room.players)||room.players.length!==2)throw Error('Invalid arena room');
 const tokens=room.players.map(p=>p?.token);
 if(tokens.some(t=>typeof t!=='string'||!t)||tokens[0]===tokens[1])throw Error('Invalid arena seats');
 const matchKey=room.code+':'+String(room.matchNumber||1)+':'+String(room.created);
 return {matchKey,tokens:[...tokens],roomCode:room.code,mode:'preparation-only'};
}
export function verifyLiveArenaRoomBinding(room,binding,token){
 if(!binding||typeof token!=='string'||!binding.tokens?.includes(token))throw Error('Unauthorized arena seat');
 const current=deriveLiveArenaRoomBinding(room);
 if(current.matchKey!==binding.matchKey||current.tokens.some((t,i)=>t!==binding.tokens[i]))throw Error('Expired arena room binding');
 return current.tokens.indexOf(token);
}
