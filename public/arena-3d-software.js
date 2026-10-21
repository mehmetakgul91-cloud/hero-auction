import {Matrix4,Matrix3,Vector3,Color,DoubleSide,BackSide} from 'three';

// Low-detail fallback for browsers without WebGL. The same 3D meshes, camera,
// depth ordering and animation poses are projected onto a 2D canvas.
export class SoftwareArenaRenderer{
 constructor(canvas){
  this.canvas=canvas;this.context=canvas.getContext('2d',{alpha:false});if(!this.context)throw Error('Canvas unavailable');
  this.isSoftwareRenderer=true;this.shadowMap={enabled:false};this.pixelRatio=1;this.clear='#0a1420';this.cache=new WeakMap();this.colors=new WeakMap();this.faces=[];this.loop=null;this.frameId=null;
  this.mvp=new Matrix4();this.vp=new Matrix4();this.normal=new Matrix3();
  this.keyLight=new Vector3(-5,12,8).normalize();this.fillLight=new Vector3(6,5,-7).normalize();
 }
 setPixelRatio(ratio){this.pixelRatio=Math.min(1,ratio);if(this.width)this.setSize(this.width,this.height);}
 setClearColor(color){this.clear=new Color(color).getStyle();}
 setSize(width,height){this.width=width;this.height=height;this.canvas.width=Math.round(width*this.pixelRatio);this.canvas.height=Math.round(height*this.pixelRatio);}
 setAnimationLoop(callback){
  if(this.frameId!==null)cancelAnimationFrame(this.frameId);this.frameId=null;this.loop=callback;
  if(!callback)return;let previous=-Infinity;
  const tick=time=>{if(!this.loop)return;if(time-previous>=1000/30-1){previous=time;this.loop(time);}if(this.loop)this.frameId=requestAnimationFrame(tick);};
  this.frameId=requestAnimationFrame(tick);
 }
 geometryData(geometry){
  let data=this.cache.get(geometry);if(data)return data;
  const positions=geometry.attributes.position.array,index=geometry.index?.array;
  const indices=index||Uint32Array.from({length:positions.length/3},(_,i)=>i),normals=new Float32Array(indices.length);
  const a=new Vector3(),b=new Vector3(),c=new Vector3();
  for(let i=0;i<indices.length;i+=3){a.fromArray(positions,indices[i]*3);b.fromArray(positions,indices[i+1]*3);c.fromArray(positions,indices[i+2]*3);b.sub(a);c.sub(a);b.cross(c).normalize();normals.set(b.toArray(),i);}
  data={positions,indices,normals,projected:new Float64Array(positions.length)};this.cache.set(geometry,data);return data;
 }
 color(material,shade){
  let colors=this.colors.get(material);if(!colors){colors=new Map();this.colors.set(material,colors);}
  const level=Math.round(shade*24),opacity=Math.round((material.opacity??1)*24),key=level+':'+opacity;
  if(!colors.has(key)){
   const color=material.color||new Color(0xffffff),amount=level/24;
   const srgb=value=>Math.round(Math.min(1,value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055)*255);
   colors.set(key,`rgba(${srgb(color.r*amount)},${srgb(color.g*amount)},${srgb(color.b*amount)},${opacity/24})`);
  }
  return colors.get(key);
 }
 render(scene,camera){
  scene.updateMatrixWorld();camera.updateMatrixWorld();this.vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const width=this.width,height=this.height;let faceCount=0;
  scene.traverseVisible(object=>{
   if(!object.isMesh||!object.geometry.attributes.position)return;
   const material=Array.isArray(object.material)?object.material[0]:object.material;if(!material||material.visible===false||material.opacity===0)return;
   const {positions,indices,normals,projected}=this.geometryData(object.geometry);
   const m=this.mvp.multiplyMatrices(this.vp,object.matrixWorld).elements,n=this.normal.getNormalMatrix(object.matrixWorld).elements;
   for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2],w=m[3]*x+m[7]*y+m[11]*z+m[15];
    projected[i]=((m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5+.5)*width;
    projected[i+1]=(.5-(m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5)*height;
    projected[i+2]=w>0?(m[2]*x+m[6]*y+m[10]*z+m[14])/w:2;
   }
   for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,az=projected[a+2],bz=projected[b+2],cz=projected[c+2];
    if(az>1||bz>1||cz>1||az< -1||bz< -1||cz< -1)continue;
    const ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];
    if(Math.max(ax,bx,cx)<0||Math.min(ax,bx,cx)>width||Math.max(ay,by,cy)<0||Math.min(ay,by,cy)>height)continue;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(Math.abs(area)<.12||material.side!==DoubleSide&&(material.side===BackSide?area<0:area>0))continue;
    let shade=1;
    if(!material.isMeshBasicMaterial){
     const x=normals[i],y=normals[i+1],z=normals[i+2];let nx=n[0]*x+n[3]*y+n[6]*z,ny=n[1]*x+n[4]*y+n[7]*z,nz=n[2]*x+n[5]*y+n[8]*z;
     const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
     shade=.45+Math.max(0,nx*this.keyLight.x+ny*this.keyLight.y+nz*this.keyLight.z)*.7+Math.max(0,nx*this.fillLight.x+ny*this.fillLight.y+nz*this.fillLight.z)*.25;
    }
    const face=this.faces[faceCount]||(this.faces[faceCount]=[]);face[0]=(az+bz+cz)/3;face[1]=ax;face[2]=ay;face[3]=bx;face[4]=by;face[5]=cx;face[6]=cy;face[7]=this.color(material,shade);face[8]=material.wireframe;face[9]=object.userData.softwareLayer||0;faceCount++;
   }
  });
  this.faces.length=faceCount;this.faces.sort((a,b)=>a[9]-b[9]||b[0]-a[0]);
  const ctx=this.context;ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);ctx.fillStyle=this.clear;ctx.fillRect(0,0,width,height);ctx.lineWidth=.6;
  for(const f of this.faces){ctx.beginPath();ctx.moveTo(f[1],f[2]);ctx.lineTo(f[3],f[4]);ctx.lineTo(f[5],f[6]);ctx.closePath();if(f[8]){ctx.strokeStyle=f[7];ctx.stroke();}else{ctx.fillStyle=f[7];ctx.fill();}}
 }
 dispose(){this.setAnimationLoop(null);this.faces=[];this.cache=new WeakMap();this.colors=new WeakMap();}
}
