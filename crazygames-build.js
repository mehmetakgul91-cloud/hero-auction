// A separate Basic Launch entry point, served from /crazygames/.
// Source assets remain shared; only platform documents/scripts are adapted.
export function crazyGamesSource(source, extension){
 if(extension==='.js')return source
  .replace(/WHATSAPP İLE DAVET ET/g,'DAVET BAĞLANTISINI KOPYALA')
  .replace(/(['"`])hero-auction-([a-z-]+)\1/g,(_,q,key)=>q+'hero-auction-cg-'+key+q)
  .replace(/https:\/\/heroauction\.com\.tr\//g,'/crazygames/')
  .replace(/(\b(?:from\s+|import\s*\(\s*))(['"])\/(?!\/|crazygames\/)/g,'$1$2/crazygames/')
  .replace(/(['"`])\/battle-preview\.html/g,'$1/crazygames/battle-preview.html')
  .replace(/location\.(replace|assign)\((['"])\/\2\)/g,"location.$1('/crazygames/')");
 if(extension!=='.html')return source;
 return source
  .replace(/<html lang="tr">/, '<html lang="en">')
  // Remove external login/ads before parsing: hiding them after load is insufficient.
  .replace(/<script\b[^>]*src=["']https:\/\/(?:pagead2\.googlesyndication\.com|accounts\.google\.com)[^"']*["'][^>]*><\/script>/gi,'')
  .replace(/<script\b[^>]*src=["']\/ad-rewards\.js[^"']*["'][^>]*><\/script>/gi,'')
  .replace(/https:\/\/heroauction\.com\.tr\//g,'/crazygames/')
  .replace(/(src=["'])\/(?!\/|crazygames\/)([^"']+\.js(?:\?[^"']*)?)(["'])/g,'$1/crazygames/$2$3')
  .replace(/(href=["'])\/(?!\/|crazygames\/)([^"']*)(["'])/g,(_,a,path,q)=>/\.(css|png|jpg|webp|svg)(\?|$)/.test(path)?a+'/'+path+q:a+'/crazygames/'+path+q)
  .replace(/<head>/,'<head><script src="/crazygames/platform.js"></script><script type="module" src="/crazygames/crazygames-en.js"></script><style>#google-login,.landing-divider,.entry-footnote,.landing-howto,.landing-story,.rewarded-ad-panel,#google-logout,a[href^="mailto:"],.entry-privacy,.disclaimer,.arena-prep-link,.art-credit{display:none!important}.cg-chat-disabled #chat-panel{display:none!important}.home-quick-nav{grid-template-columns:repeat(4,minmax(0,1fr))}</style>')
  .replace('Bir oyuncu adı belirle, giriş yöntemini seç ve arenaya katıl.','Oyunun hazırlanıyor. Bağlantı kesilirse aşağıdaki düğmeyle tekrar deneyebilirsin.')
  .replace(/VEYA GOOGLE İLE DEVAM ET/g,'')
  .replace('</footer>','<p class="cg-privacy-notice">Oyuncu kimliği ve ilerleme oyun sunucusunda saklanır. <a href="/crazygames/crazygames-privacy.html" target="_blank" rel="noopener">Gizlilik bilgisi</a></p></footer>')
  .replace(/Misafir veya Google girişiyle oynayabilirsin\./g,'Misafir olarak hemen oynayabilirsin.');
}
