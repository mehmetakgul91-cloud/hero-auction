// Cosmetic identity only. Never transport account progression into auction views.
const classes=new Set(['attack','defense','magic','support']);
export const auctionAdmissions=new WeakSet();
export function publicAuctionCommander(profile){
 return classes.has(profile?.commanderId)?{commanderId:profile.commanderId}:null;
}
export function setAuctionCommanderIdentity(player,profile){
 player.commander=publicAuctionCommander(profile);
}
const hydrationFlights=new WeakMap();
export function hydrateAuctionCommanders(room,options){
 if(hydrationFlights.has(room))return hydrationFlights.get(room);
 if(!room.players.some(p=>p&&p.commander===undefined))return Promise.resolve();
 const flight=refreshAuctionCommanders(room,{...options,missingOnly:true}).finally(()=>{if(hydrationFlights.get(room)===flight)hydrationFlights.delete(room)});
 hydrationFlights.set(room,flight);return flight;
}
export async function refreshAuctionCommanders(room,{database,databaseReady,profiles,timeoutMs=750,setTimer=setTimeout,clearTimer=clearTimeout,missingOnly=false}={}){
 const players=room.players.slice();
 // Identity writes allocate a fresh allowlisted object. A changed reference
 // means a newer selection/read won while this lookup was awaiting the DB.
 const previous=players.map(p=>p?.commander);
 const identities=players.map(p=>publicAuctionCommander(p?.commander));
 let loaded=false;
 const ids=players.map(p=>p?.accountId).filter(Boolean);
 if(database&&databaseReady&&ids.length){
  let timer;
  try{
   // The losing query never mutates the room; late values are discarded.
   const result=await Promise.race([
    Promise.resolve().then(()=>database.query({text:"SELECT account_id,profile->>'commanderId' AS commander_id FROM hero_auction_commanders WHERE account_id=ANY($1::text[])",values:[ids],query_timeout:timeoutMs})),
    new Promise(resolve=>{timer=setTimer(()=>resolve(null),timeoutMs)})
   ]);
   if(result){loaded=true;const byId=new Map(result.rows.map(row=>[row.account_id,{commanderId:row.commander_id}]));players.forEach((p,i)=>{identities[i]=publicAuctionCommander(byId.get(p?.accountId))})}
  }catch{/* Cosmetic failure must not fail a paid admission. */}finally{clearTimer(timer)}
 }else if(!database&&profiles){loaded=true;players.forEach((p,i)=>{identities[i]=publicAuctionCommander(profiles.get(p?.accountId))})}
 if(room.mode==='bot'){
  identities[1]=publicAuctionCommander(room.botCommander);
  identities[0]??={commanderId:'attack'};
 }
 // Keep undefined retryable after a transient failure; null means loaded/absent.
 players.forEach((p,i)=>{if((loaded||previous[i]!==undefined||room.mode==='bot')&&p&&room.players[i]===p&&p.commander===previous[i]&&(!missingOnly||previous[i]===undefined))setAuctionCommanderIdentity(p,identities[i])});
}
