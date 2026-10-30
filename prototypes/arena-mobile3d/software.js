import {Color} from 'three';
import {SoftwareArenaRenderer} from './shared/arena-3d-software.js';
// Visual-only fallback for restricted browsers. Never used for GPU benchmark results.
export class PreviewSoftwareRenderer extends SoftwareArenaRenderer{
 constructor(canvas){super(canvas);this.vertexColours=new WeakMap();}
 textureColors(material,geometry,indices){
  if(!material.vertexColors||!geometry.attributes.color)return super.textureColors(material,geometry,indices);
  let values=this.vertexColours.get(geometry);if(values)return values;
  values=new Uint8Array(indices.length);values.triangles=[];const attribute=geometry.attributes.color,c=new Color();
  for(let i=0;i<indices.length;i+=3){c.fromBufferAttribute(attribute,indices[i]).convertLinearToSRGB();values[i]=Math.round(c.r*255);values[i+1]=Math.round(c.g*255);values[i+2]=Math.round(c.b*255);}
  this.vertexColours.set(geometry,values);return values;
 }
}
