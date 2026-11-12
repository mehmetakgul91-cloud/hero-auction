// Capture once from the full starting team, including defeated heroes. These
// slots match getArenaLaneLayout: only an explicit 'front' belongs to the front.
// Keep only IDs so later deaths, revivals and mutable hero data cannot move slots.
export function captureCommanderFormation(team){
 if(!Array.isArray(team))throw new TypeError('Commander formation requires a team array');
 if(team.length>5)throw new RangeError('Commander formation supports at most five heroes');
 const seen=new Set(),lanes={front:[],back:[]},slots=[];
 for(const hero of team){
  if(!hero||typeof hero.id!=='string')throw new TypeError('Commander formation requires string hero IDs');
  if(seen.has(hero.id))throw new TypeError('Commander formation requires distinct hero IDs');
  seen.add(hero.id);
  const lane=hero.lane==='front'?'front':'back';
  const slot={id:hero.id,lane,index:lanes[lane].length};
  lanes[lane].push(slot);slots.push(slot);
 }
 return Object.freeze(Object.fromEntries(slots.map(own=>[own.id,Object.freeze(slots.filter(other=>{
  if(own.lane===other.lane)return Math.abs(own.index-other.index)===1;
  const nOwn=lanes[own.lane].length,nOther=lanes[other.lane].length;
  // Center distance <= one denser-lane spacing, with exact integer arithmetic.
  return Math.abs((2*own.index+1)*nOther-(2*other.index+1)*nOwn)<=2*Math.min(nOwn,nOther);
 }).map(other=>other.id))])));
}
