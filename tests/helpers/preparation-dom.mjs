// Minimal DOM for component semantics, not a substitute for browser layout QA.
export function preparationDocument(){
 const document={activeElement:null};
 const walk=node=>[node,...node.children.flatMap(walk)];
 function matches(node,selector){
  const tag=selector.match(/^[a-z]+/i)?.[0],cls=selector.match(/\.([\w-]+)/)?.[1],attr=selector.match(/\[([\w-]+)="([^"]*)"\]/);
  return (!tag||node.tagName===tag.toUpperCase())&&(!cls||node.classList.contains(cls))&&(!attr||String(attr[1].startsWith('data-')?node.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]:node.attributes[attr[1]])===attr[2]);
 }
 document.createElement=tag=>{
  const node={tagName:tag.toUpperCase(),ownerDocument:document,children:[],attributes:{},dataset:{},style:{},className:'',parentNode:null,isRoot:false,text:'',hidden:false,disabled:false,
   get isConnected(){return this.isRoot||!!this.parentNode?.isConnected},
   set textContent(value){this.text=String(value);this.replaceChildren()},
   get textContent(){return this.text+this.children.map(child=>child.textContent).join('')},
   setAttribute(name,value){this.attributes[name]=String(value)},
   append(...children){for(const child of children){if(child.parentNode)child.remove();this.children.push(child);child.parentNode=this}},
   prepend(child){if(child.parentNode)child.remove();this.children.unshift(child);child.parentNode=this},
   replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children)},
   remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null},
   contains(target){return walk(this).includes(target)},
   querySelector(selector){return this.querySelectorAll(selector)[0]||null},
   querySelectorAll(selector){return walk(this).slice(1).filter(node=>matches(node,selector))},
   focus(){document.activeElement=this},
   click(){if(!this.disabled){this.focus();this.onclick?.()}},
   set src(value){this._src=value;if(this.tagName==='IMG')queueMicrotask(()=>this.onload?.())},
   get src(){return this._src}
  };
  node.classList={contains:value=>node.className.split(' ').includes(value),toggle(value,enabled){const set=new Set(node.className.split(' ').filter(Boolean));if(enabled??!set.has(value))set.add(value);else set.delete(value);node.className=[...set].join(' ')}};
  return node;
 };
 const root=document.createElement('section');root.isRoot=true;
 return {document,root,walk:()=>walk(root)};
}
