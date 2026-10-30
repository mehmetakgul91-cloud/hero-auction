import * as T from 'three';
// Small deterministic authored texture; no network assets or runtime canvas.
export function stoneTexture(size=64){
 const data=new Uint8Array(size*size*4);let seed=719;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const grain=(seed>>>24)/255,vein=Math.sin(x*.17+y*.11)*Math.sin(y*.29-x*.04);const value=Math.round(224+grain*15+vein*9),i=(y*size+x)*4;data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;}
 const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
export function softContactTexture(size=32){const data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=0;data[i+3]=Math.round(180*Math.pow(Math.max(0,1-r),1.6));}const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;return texture;}
export function bevelBlock(){const shape=new T.Shape();shape.moveTo(-.47,-.47);shape.lineTo(.47,-.47);shape.lineTo(.47,.47);shape.lineTo(-.47,.47);shape.closePath();const geometry=new T.ExtrudeGeometry(shape,{depth:.94,bevelEnabled:true,bevelSize:.03,bevelThickness:.03,bevelSegments:1,steps:1,curveSegments:1});geometry.center();return geometry;}

// One continuous mineral surface. No cell boundaries, tiling/checker colors or emblem.
export function mineralFloorTexture(size=256){
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,warp=Math.sin(u*8+Math.sin(v*5))*0.18+Math.sin(v*13-u*3)*.06;
  const vein=Math.pow(Math.max(0,1-Math.abs(Math.sin((v+warp)*13+u*2))*12),2);
  const cloud=Math.sin(u*11+v*5)*Math.sin(v*9-u*4)*5+Math.sin(u*27+Math.sin(v*17))*2;
  const grain=((Math.imul(x+13,73856093)^Math.imul(y+17,19349663))>>>0)%11-5;
  const n=Math.round(220+cloud+grain*.35-vein*16),i=(y*size+x)*4;
  data[i]=n;data[i+1]=n;data[i+2]=n;data[i+3]=255;
 }
 const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
export function continuousFloorGeometry(){
 const w=4.375,h=5.05,r=.72,s=new T.Shape();
 s.moveTo(-w+r,-h);s.lineTo(w-r,-h);s.quadraticCurveTo(w,-h,w,-h+r);s.lineTo(w,h-r);s.quadraticCurveTo(w,h,w-r,h);s.lineTo(-w+r,h);s.quadraticCurveTo(-w,h,-w,h-r);s.lineTo(-w,-h+r);s.quadraticCurveTo(-w,-h,-w+r,-h);
 const g=new T.ExtrudeGeometry(s,{depth:.16,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2,steps:1,curveSegments:10});
 const p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+w)/(w*2),(p.getY(i)+h)/(h*2));uv.needsUpdate=true;return g;
}
