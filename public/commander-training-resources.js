// This legacy training view must not reconstruct energy from actions: casualties
// grant energy too. Use the server's exact post-command, pre-hero-turn snapshot.
export function trainingCommanderResources(result,round){
 const entry=result?.commanderResourcesByRound?.find(value=>value.round===round);
 if(!entry||![entry.energy,entry.ultimateEnergy].every(pool=>Array.isArray(pool)&&pool.length===2&&pool.every(value=>Number.isInteger(value)&&value>=0&&value<=100))||!Array.isArray(entry.ultimateUsed))return null;
 return {energy:entry.energy[0],ultimateEnergy:entry.ultimateEnergy[0],ultimateUsed:entry.ultimateUsed[0]===true};
}
