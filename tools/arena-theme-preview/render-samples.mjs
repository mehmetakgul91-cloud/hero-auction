// Offline sample markup from the production renderer; no fetch, account or room.
import fs from 'node:fs';
import {createArenaTeamRenderer} from '../../public/arena-team-renderer.js';
import {getArenaLaneLayout} from '../../public/arena-viewport.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.text='';this.raw='';this.className='';this.parent=null;this.root=false;this.style={setProperty(k,v){this[k]=v;}};this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ')},toggle:(name,on)=>on?this.classList.add(name):this.className=this.className.split(' ').filter(x=>x!==name).join(' ')};}
 get isConnected(){return this.root||!!this.parent?.isConnected} set innerHTML(s){this.raw=s;this.children=[]}set textContent(s){this.text=String(s);this.children=[]}get textContent(){return this.text}
 append(...nodes){for(const n of nodes){n.remove();n.parent=this;this.children.push(n)}}remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null}}replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes)}insertBefore(n,before){n.remove();n.parent=this;this.children.splice(before?this.children.indexOf(before):this.children.length,0,n)}setAttribute(k,v){this.attrs[k]=String(v)}removeAttribute(k){delete this.attrs[k]}set src(v){this.url=v;this.naturalWidth=300;this.naturalHeight=400;this.onload?.()}
}
function html(n){const a={...n.attrs};if(n.className)a.class=n.className;for(const [k,v]of Object.entries(n.dataset))a['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=v;if(n.url)a.src=n.url;for(const k of ['alt','decoding','title'])if(n[k])a[k]=n[k];const style=Object.entries(n.style).filter(([,v])=>typeof v!=='function').map(([k,v])=>k.startsWith('--')?k+':'+v:k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+v).join(';');if(style)a.style=style;return'<'+n.tag+Object.entries(a).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('')+'>'+(['img'].includes(n.tag)?'':esc(n.text)+n.raw+n.children.map(html).join('')+'</'+n.tag+'>')}
const roster=JSON.parse(fs.readFileSync(new URL('../../battle-roster.json',import.meta.url),'utf8')).characters;
// Portraits and names are real; HP/shield values are clearly labelled sample state.
const ids=['original:01','original:07','original:09','original:14','original:15','original:06','original:10','original:11','original:12','original:13'];
const units=ids.map((id,i)=>({...roster.find(h=>h.id===id),lane:i%5<2?'front':'back',hp:[100,82,63,44,91][i%5],maxHp:100,shield:[25,0,40,8,0][i%5]}));
const document={documentElement:{lang:'tr'},createElement:tag=>new Element(tag)};
const renderer=createArenaTeamRenderer({document,loadArt:u=>u.portrait});
const output={};
for(const layoutName of ['normal','all-front']){
 const teams=[units.slice(0,5),units.slice(5)].map(t=>t.map(u=>({...u,lane:layoutName==='all-front'?'front':u.lane})));
 const layout=getArenaLaneLayout(teams),parents=[new Element(),new Element()];parents.forEach(p=>p.root=true);
 for(let side=0;side<2;side++)renderer.update(parents[side],teams[side],{side,rows:layout.rows,laneRows:layout.teams[side],fittedRows:layout.teams[side],roleNames:{tank:'Tank',fighter:'Savaşçı',energy:'Enerji',support:'Destek',assassin:'Suikastçı'}});
 await new Promise(resolve=>setImmediate(resolve));output[layoutName]={rows:layout.rows,teams:parents.map(p=>p.children.map(html).join(''))};
}
fs.writeFileSync(new URL('../../artifacts/arena-themes/sample-markup.json',import.meta.url),JSON.stringify(output));
console.log('Production renderer produced ten cards for each of two valid formation samples; no external calls.');
