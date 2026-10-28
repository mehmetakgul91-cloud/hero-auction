import {randomInt} from 'node:crypto';
import {ARENA_THEME_IDS,fallbackArenaTheme,validatedArenaPresentation} from './public/arena-theme.js';

export const arenaMatchKey=room=>`${room.code}:${room.matchNumber||1}:${room.created}`;
// Called only for a genuinely new room/match, never by a snapshot, poll or cast.
// This cryptographic cosmetic draw is separate from every combat seed/PRNG.
export function startRoomArenaTheme(room,{randomIndex=randomInt}={}){
 const existing=room.arenaPresentation&&validatedArenaPresentation(room.arenaPresentation,arenaMatchKey(room));
 if(existing)return existing;
 const previous=room.arenaPresentation?.theme;
 const alternatives=ARENA_THEME_IDS.filter(theme=>theme!==previous);
 // A single active theme is a valid pool: rematches must never draw from zero.
 const choices=alternatives.length?alternatives:ARENA_THEME_IDS;
 const index=randomIndex(choices.length);
 if(!Number.isInteger(index)||index<0||index>=choices.length)throw new RangeError('Invalid cosmetic random index');
 room.arenaPresentation={version:1,matchKey:arenaMatchKey(room),theme:choices[index]};
 return {...room.arenaPresentation};
}
// Restored legacy rooms retain a stable deterministic fallback without changing
// saved battle results or needing a database/schema migration.
export function roomArenaPresentation(room){
 const matchKey=arenaMatchKey(room);
 return validatedArenaPresentation(room.arenaPresentation,matchKey)||{version:1,matchKey,theme:fallbackArenaTheme(matchKey)};
}
