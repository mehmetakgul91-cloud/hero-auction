// Shared display price; the server enforces the debit in the wallet transaction.
export const COMMANDER_CHANGE_COST=1000;

// Approved progression: 0→1 costs 200, then ×1.2 per level. Round once
// from the initial price, not recursively; BigInt avoids floating point drift.
export function commanderGoldUpgradeCost(currentLevel){
 if(!Number.isInteger(currentLevel)||currentLevel<0||currentLevel>=40)throw Error('Geliştirme sınırı');
 const exponent=BigInt(currentLevel),denominator=5n**exponent;
 return Number((200n*6n**exponent+denominator-1n)/denominator);
}
