// Presentation-only randomness: this module never participates in battle decisions.
export function createArenaPlaylist(tracks,{storage,key='hero-auction-arena-playlist',random=Math.random}={}){
 const byId=new Map(tracks.map(track=>[track.id,track]));
 if(!tracks.length||byId.size!==tracks.length)throw new Error('Arena playlist needs unique tracks');
 const ids=[...byId.keys()],signature=ids.join('|');
 let state={signature,remaining:[],previous:null,current:null};
 try{
  const saved=JSON.parse(storage?.getItem(key)||'null');
  if(saved?.signature===signature&&Array.isArray(saved.remaining)&&saved.remaining.length<=ids.length&&new Set(saved.remaining).size===saved.remaining.length&&saved.remaining.every(id=>byId.has(id))){
   state.remaining=[...saved.remaining];state.previous=byId.has(saved.previous)?saved.previous:null;
   const current=saved.current;
   if(current&&typeof current.matchKey==='string'&&current.matchKey.length<=256&&byId.has(current.id)&&typeof current.committed==='boolean'&&(current.committed?!state.remaining.includes(current.id):state.remaining[0]===current.id))state.current={...current};
  }
 }catch{/* Storage restrictions or old/corrupt data must never block a match. */}
 const save=()=>{try{storage?.setItem(key,JSON.stringify(state))}catch{}};
 function refill(){
  state.remaining=[...ids];
  for(let i=ids.length-1;i>0;i--){
   const value=Number(random()),j=Math.floor((Number.isFinite(value)?Math.max(0,Math.min(.999999999,value)):0)*(i+1));
   [state.remaining[i],state.remaining[j]]=[state.remaining[j],state.remaining[i]];
  }
  // A new cycle is shuffled, but its first track cannot repeat the last one.
  if(ids.length>1&&state.remaining[0]===state.previous)[state.remaining[0],state.remaining[1]]=[state.remaining[1],state.remaining[0]];
 }
 return {
  select(matchKey,{activate=true}={}){
   if(typeof matchKey!=='string'||!matchKey||matchKey.length>256)throw new Error('A match key is required');
   if(state.current?.matchKey!==matchKey){
    if(!state.remaining.length)refill();
    state.current={matchKey,id:state.remaining[0],committed:false};
   }
   // Preparation may silently unlock the selected element on Safari, but an
   // abandoned preparation must not consume a soundtrack from the battle cycle.
   if(activate&&!state.current.committed){
    state.remaining=state.remaining.filter(id=>id!==state.current.id);
    state.previous=state.current.id;state.current.committed=true;
   }
   save();return byId.get(state.current.id);
  }
 };
}
