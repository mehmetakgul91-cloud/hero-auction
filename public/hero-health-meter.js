// Presentation only: compare the unrounded ratio, never the displayed width.
// Dead heroes retain their existing defeated/hidden treatment, not a warning.
export function heroHealthMeter(unit){
 const hp=Number(unit.hp),maxHp=Number(unit.maxHp);
 const valid=Number.isFinite(hp)&&Number.isFinite(maxHp)&&maxHp>0;
 const ratio=valid?Math.max(0,Math.min(1,hp/maxHp)):0;
 return {percent:ratio*100,low:valid&&hp>0&&ratio<0.2};
}
