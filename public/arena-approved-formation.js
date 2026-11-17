// Visual lanes follow the server's formation. Never reorder or mutate units.
const approved=[[[.33,.32],[.44,.56],[.15,.35],[.34,.81],[.15,.72]],[[.72,.31],[.61,.57],[.88,.38],[.77,.80],[.89,.69]]];
export function approvedArenaPositions(units,side=0){
 const front=units.filter(u=>u.lane==='front'),back=units.filter(u=>u.lane!=='front'),result=new Map();
 if(front.length===2&&back.length===3){[...front,...back].forEach((u,i)=>result.set(u.id,approved[side?1:0][i]));return result;}
 for(const [isFront,lane] of [[true,front],[false,back]])lane.forEach((u,j)=>{
  const n=lane.length,ys=n===1?[.56]:n===2?[.36,.72]:n===3?[.32,.56,.80]:n===4?[.29,.46,.63,.80]:[.32,.45,.58,.71,.84];
  const x=(isFront?.26:.12)+(j%2?(isFront?.16:.12):0);result.set(u.id,[side?1-x:x,ys[j]??.56]);
 });return result;
}
