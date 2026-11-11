// Identity-bound read only recovery. Never admits a player or changes a match.
export function roomRecoveryStage(room) {
 if(room.idleClosed||room.disconnectForfeit||room.cancelled||['closed','cancelled'].includes(room.phase))return 'result';
 const battle=room.battleSync?.result;
 if(battle&&(!room.matchSettled||battle.finished===true||battle.live!==true))return 'arena';
 if(room.matchSettled)return 'result';
 if(room.phase==='finished'&&room.players?.every(p=>p?.team?.length===5))return 'formation';
 return room.phase==='auction'?'auction':'waiting';
}
export function resolveAccountRoom({accountId,pointer,rooms}) {
 if(typeof accountId!=='string'||!accountId)return null;
 if(pointer?.ambiguous)throw Object.assign(Error('Birden fazla aktif maç kaydı var; otomatik dönüş doğrulanamadı.'),{status:409});
 if(!pointer||pointer.detached)return null;
 const room=rooms.get(pointer.code);
 if(!room||room.created!==pointer.created||(room.matchNumber||1)!==pointer.matchNumber)return null;
 const seat=pointer.seat;
 if(![0,1].includes(seat)||room.players?.[seat]?.accountId!==accountId||typeof room.players[seat].token!=='string'||!room.players[seat].token)return null;
 return{room,seat,stage:roomRecoveryStage(room)};
}
