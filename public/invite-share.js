// Sharing must never navigate away from the host's room or leave an empty tab.
export function inviteUrl(code,origin){
 if(!/^\d{3}$/.test(String(code)))throw new Error('Geçersiz oda kodu.');
 const url=new URL('/',origin);url.searchParams.set('join',code);return url.toString();
}
export function createInviteSharer({origin,navigator,notify,showLink}){
 let busy=false;
 async function copyLink(link){
  try{
   await navigator.clipboard.writeText(link);
   notify('Davet bağlantısı kopyalandı. WhatsApp sohbetine yapıştırabilirsin.');
  }catch{showLink(link);}
 }
 async function run(code,copyOnly){
  if(busy)return;
  busy=true;
  try{
   const url=inviteUrl(code,origin);
   if(copyOnly||typeof navigator.share!=='function'){await copyLink(url);return;}
   try{
    // No awaits before share: retain the click's transient user activation.
    await navigator.share({title:'Hero Auction',text:"⚔️ Hero Auction'da sana meydan okuyorum! Odaya katıl ve 20 krediyle takımını kur:",url});
   }catch(error){
    // Dismissing the share sheet is not a request to copy or navigate.
    if(error?.name!=='AbortError')await copyLink(url);
   }
  }catch(error){notify(error.message);}
  finally{busy=false;}
 }
 return {share:code=>run(code,false),copy:code=>run(code,true)};
}
