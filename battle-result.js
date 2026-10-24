// One winner rule for completed live battles and deterministic simulations.
export function battleOutcome(teams){
 const hpRatio=teams.map(team=>team.reduce((n,hero)=>n+hero.hp/hero.maxHp,0));
 const damage=teams.map(team=>team.reduce((n,hero)=>n+(hero.damage||0),0));
 const survivors=teams.map(team=>team.filter(hero=>hero.hp>0).length);
 let winner=null;
 if(survivors[0]!==survivors[1]&&(survivors[0]===0||survivors[1]===0))winner=survivors[0]>survivors[1]?0:1;
 else if(Math.abs(hpRatio[0]-hpRatio[1])>1e-9)winner=hpRatio[0]>hpRatio[1]?0:1;
 else if(damage[0]!==damage[1])winner=damage[0]>damage[1]?0:1;
 else if(survivors[0]!==survivors[1])winner=survivors[0]>survivors[1]?0:1;
 return {winner,damage,survivors};
}
