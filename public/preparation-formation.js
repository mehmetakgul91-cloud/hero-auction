// One deterministic default per acquired roster. Per-hero lane data is authoritative:
// some fighters prefer the back and some support heroes prefer the front.
const roles=new Set(['tank','fighter','energy','assassin','support']);
const lanes=new Set(['front','back']);
const validTeam=team=>Array.isArray(team)&&team.length===5&&team.every(hero=>hero&&typeof hero.id==='string'&&hero.id&&roles.has(hero.role))&&new Set(team.map(hero=>hero.id)).size===5;

export function preferredLane(hero){
 const front=Number(hero?.laneModifiers?.front),back=Number(hero?.laneModifiers?.back);
 if(Number.isFinite(front)&&Number.isFinite(back)&&front!==back)return front>back?'front':'back';
 // Stable fallback for standalone previews or older metadata, never hero names.
 return hero?.role==='tank'||hero?.role==='fighter'?'front':'back';
}

export function buildDefaultFormation(team){
 if(!validTeam(team))throw new Error('Five distinct heroes with valid roles are required');
 // Preserve acquisition order: changing lanes must not silently reorder combat turns.
 return {positions:team.map((_,index)=>index),lanes:team.map(preferredLane),roles:team.map(hero=>hero.role)};
}

export function validateFormation(formation,team){
 if(!validTeam(team)||!formation)return false;
 const {positions,lanes:chosen,roles:assigned}=formation;
 if(!Array.isArray(positions)||positions.length!==5||new Set(positions).size!==5||positions.some(index=>!Number.isInteger(index)||index<0||index>=5))return false;
 if(!Array.isArray(chosen)||chosen.length!==5||chosen.some(lane=>!lanes.has(lane)))return false;
 // Existing battle rules permit zero through five heroes in either row.
 return Array.isArray(assigned)&&assigned.length===5&&assigned.every((role,slot)=>role===team[positions[slot]].role);
}
