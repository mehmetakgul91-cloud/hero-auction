// Ordinary damage reaches shields after the existing mitigation/raw-damage step.
// Keep whole damage points: floor the 70% budget so shields never block more
// than 70%. Any unused shield persists; this is NOT a cap on shield generation.
// Invalid/negative inputs cannot produce negative absorption or NaN.
export function calculateShieldAbsorption(shield,damage){
 const available=Number.isFinite(shield)?Math.max(0,shield):0;
 const incoming=Number.isFinite(damage)?Math.max(0,damage):0;
 // Multiply by the integer ratio first: 90 * .7 would wrongly floor to 62.
 // For enormous non-game values avoid overflowing the intermediate product.
 const budget=Math.floor(incoming<=Number.MAX_SAFE_INTEGER/7?incoming*7/10:incoming*.7);
 return Math.min(available,budget);
}
