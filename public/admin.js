const $=id=>document.getElementById(id);
let login=null;try{login=JSON.parse(localStorage.getItem('hero-auction-login')||'null')}catch{}
const status=t=>$('status').textContent=t;
async function api(path,body={}){const r=await fetch('/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:login?.authToken})});const j=await r.json();if(!r.ok)throw Error(j.error||'İşlem başarısız');return j}
async function load(){
 try{
  const d=await api('list',{search:$('search').value});
  $('dashboard').hidden=false;$('historyPanel').hidden=false;$('refresh').hidden=false;
  const tbody=$('accounts');tbody.replaceChildren();
  for(const a of d.accounts){
   const tr=document.createElement('tr');
   for(const value of [a.account_id,String(a.gold),a.banned?'Askıda':'Aktif']){const td=document.createElement('td');td.textContent=value;tr.append(td)}
   const td=document.createElement('td');
   const gold=document.createElement('button');gold.textContent='Altın düzenle';gold.onclick=async()=>{const value=prompt('Yeni altın miktarı (0–100000000)',String(a.gold));if(value===null)return;const n=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(n)||n>100000000){alert('Geçersiz miktar');return}if(!confirm('Altın bakiyesi '+n+' olarak ayarlansın mı?'))return;await act('gold',{accountId:a.account_id,gold:n})};
   const ban=document.createElement('button');ban.textContent=a.banned?'Etkinleştir':'Askıya al';ban.onclick=async()=>{if(!confirm(a.account_id+' için üyelik durumu değiştirilsin mi?'))return;await act('ban',{accountId:a.account_id,banned:!a.banned})};
   td.append(gold,' ',ban);tr.append(td);tbody.append(tr);
  }
  const h=await api('history');$('history').replaceChildren();
  for(const a of h.history){const p=document.createElement('p');p.textContent=new Date(a.created_at).toLocaleString('tr-TR')+' • '+a.account_id+' • '+a.action+' • '+a.old_gold+' → '+a.new_gold;$('history').append(p)}
  status(d.accounts.length+' hesap listelendi.');
 }catch(e){status(e.message);$('dashboard').hidden=true;$('historyPanel').hidden=true}
}
async function act(path,data){try{await api(path,data);await load()}catch(e){alert(e.message)}}
$('login').onclick=()=>{if(!login?.authToken){status('Önce ana sayfada yetkili Google hesabıyla giriş yapın.');return}load()};
$('refresh').onclick=load;$('find').onclick=load;
if(login?.authToken)load();else status('Önce oyuna yönetici Google hesabınızla giriş yapın.');