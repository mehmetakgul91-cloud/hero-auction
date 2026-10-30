import * as T from 'three';
// Small deterministic authored texture; no network assets or runtime canvas.
export function stoneTexture(size=64){
 const data=new Uint8Array(size*size*4);let seed=719;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const grain=(seed>>>24)/255,vein=Math.sin(x*.17+y*.11)*Math.sin(y*.29-x*.04);const value=Math.round(224+grain*15+vein*9),i=(y*size+x)*4;data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;}
 const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
export function softContactTexture(size=32){const data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=0;data[i+3]=Math.round(180*Math.pow(Math.max(0,1-r),1.6));}const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;return texture;}
export function bevelBlock(){const shape=new T.Shape();shape.moveTo(-.47,-.47);shape.lineTo(.47,-.47);shape.lineTo(.47,.47);shape.lineTo(-.47,.47);shape.closePath();const geometry=new T.ExtrudeGeometry(shape,{depth:.94,bevelEnabled:true,bevelSize:.03,bevelThickness:.03,bevelSegments:1,steps:1,curveSegments:1});geometry.center();return geometry;}
