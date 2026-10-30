export const QUALITY={mobile:{label:'Mobil',dpr:1,maxPixels:900000},balanced:{label:'Dengeli',dpr:1.5,maxPixels:1600000}};
export function bufferSize(width,height,dpr=1,quality='mobile'){
 const policy=QUALITY[quality]||QUALITY.mobile;
 const ratio=Math.min(Math.max(.5,dpr),policy.dpr,Math.sqrt(policy.maxPixels/Math.max(1,width*height)));
 return {width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio)),ratio};
}
export class FrameMetrics{
 constructor(){this.reset();}
 reset(){this.samples=[];this.drawMax=0;this.trianglesMax=0;this.geometriesMax=0;this.texturesMax=0;this.longTasks=0;this.longTaskMs=0;this.overflow=false;}
 add(ms,info){if(!Number.isFinite(ms)||ms<=0)return;if(this.samples.length>=18000){this.overflow=true;return;}this.samples.push(ms);this.drawMax=Math.max(this.drawMax,info.render.calls);this.trianglesMax=Math.max(this.trianglesMax,info.render.triangles);this.geometriesMax=Math.max(this.geometriesMax,info.memory.geometries);this.texturesMax=Math.max(this.texturesMax,info.memory.textures);}
 result(){const ordered=[...this.samples].sort((a,b)=>a-b),count=ordered.length,total=this.samples.reduce((a,b)=>a+b,0);const percentile=p=>count?ordered[Math.min(count-1,Math.ceil(count*p)-1)]:null;
  return {frames:count,sampleSeconds:total/1000,fps:total?count*1000/total:null,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),over33msPercent:count?100*this.samples.filter(x=>x>33.34).length/count:null,drawCallsMax:this.drawMax,trianglesMax:this.trianglesMax,geometriesMax:this.geometriesMax,texturesMax:this.texturesMax,longTasks:this.longTasks,longTaskMs:this.longTaskMs,overflow:this.overflow};}
}
export function assess(result,{valid=true,complete=true}={}){
 if(!valid||!complete||result.overflow||result.sampleSeconds<29.5)return 'incomplete';
 return result.fps>=45&&result.p95Ms<=33.34&&result.over33msPercent<=5&&result.drawCallsMax<=180&&result.trianglesMax<=400000?'pass':'review';
}
