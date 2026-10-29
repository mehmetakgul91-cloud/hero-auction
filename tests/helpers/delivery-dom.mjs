export function deliveryDocument(){
 const doc={};
 doc.createElement=tag=>({tag,ownerDocument:doc,children:[],attributes:{},isRoot:false,
  get isConnected(){return this.isRoot||!!this.parentNode?.isConnected;},
  setAttribute(name,value){this.attributes[name]=value;},
  append(...nodes){for(const node of nodes){this.children.push(node);node.parentNode=this;}},
  prepend(node){this.children.unshift(node);node.parentNode=this;},
  replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...nodes);},
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
 });
 return doc;
}
export function deliveryBox(){
 const doc=deliveryDocument(),slot=doc.createElement('div');slot.isRoot=true;
 return {count:{textContent:''},slot,markup:'',set innerHTML(html){this.markup=html;this.count.textContent=html.match(/class="delivery-count">([^<]+)/)?.[1]||'';slot.replaceChildren();},get innerHTML(){return this.markup;},querySelector(selector){return selector==='.delivery-count'?this.count:slot;}};
}
