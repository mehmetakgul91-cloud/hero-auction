import {createArenaEmotes} from './arena-emotes.js?v=original-six-20261105';

// Keep the picker and request state stable while player headers are repainted.
export function createAuctionEmotes({window,document,getContext}){
 const parking=document.createElement('div');
 const readContext=()=>{
  const {session,room,authToken,active}=getContext();
  if(!active||!session||room?.phase!=='auction'||session.code!==room.code)return null;
  // Another tab can replace persisted login before app.js refreshes its memory.
  try{if(JSON.parse(window.localStorage.getItem('hero-auction-login')||'null')?.authToken!==authToken)return null;}catch{return null;}
  return {code:session.code,token:session.token,identity:authToken,matchKey:room.matchKey};
 };
 const reactions=createArenaEmotes({window,document,nav:parking,readContext,listenLive:false});
 function update(){
  reactions.syncContext();
  const {room}=getContext();
  if(!readContext())return;
  const mine=document.querySelector('#player0 .auction-player-heading'),opponent=document.querySelector('#player1 .auction-player-heading');
  reactions.mount(mine,opponent);
  reactions.apply(room?.arenaEmotes);
 }
 return {update,hide:()=>reactions.reset(),destroy:()=>reactions.destroy()};
}
