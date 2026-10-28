import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { apiUrl, linkAction, readConfig } from './policy.js';
import { mountNativeLayout } from './layout.js';
const config = readConfig(window.__HERO_NATIVE_CONFIG__);
let active = true;
window.HeroNative = Object.freeze({...config, native:Capacitor.isNativePlatform(), get active(){return active;}});
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const source = input instanceof Request ? input.url : String(input);
  const target = apiUrl(source, location.origin, config.apiOrigin);
  if (!target) return originalFetch(input, init);
  if (!config.configured) return Promise.reject(Error('Android test sunucusu henüz yapılandırılmadı. Bu sürüm yalnızca arayüz önizlemesidir.'));
  const request = input instanceof Request ? new Request(target, input) : target;
  // Never send browser cookies or follow an API redirect carrying an auth body.
  return originalFetch(request, {...init, credentials:'omit', redirect:'error'});
};
const OriginalEventSource = window.EventSource;
window.EventSource = class extends OriginalEventSource {
  constructor(url, options) {
    const mapped = apiUrl(String(url), location.origin, config.apiOrigin);
    if (mapped && !config.configured) throw Error('Android test sunucusu henüz yapılandırılmadı.');
    super(mapped || url, {...options, withCredentials:false});
  }
};
function notice(message) {
  const status = document.getElementById('native-status');
  if (status) status.textContent = message;
  const menu=document.getElementById('native-game-menu');if(menu)menu.open=true;
}
function startUI() {
  const status = document.createElement('aside'); status.id='native-status'; status.setAttribute('role','status');
  status.textContent = config.configured
    ? 'ANDROID TEST · İnternet gerekir · Misafir girişi · Google girişi henüz yok'
    : 'ANDROID ARAYÜZ ÖNİZLEMESİ · Sunucu bağlı değil · Henüz oynanabilir sürüm değil';
  document.body.prepend(status);
  mountNativeLayout({window,document});
  if (!config.configured) {
    const guest = document.getElementById('guest-login');
    if (guest) {guest.disabled=true;guest.textContent='TEST SUNUCUSU BEKLENİYOR';}
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startUI, {once:true}); else startUI();
document.addEventListener('click', event => {
  const link = event.target?.closest?.('a[href]');
  if (!link || event.defaultPrevented) return;
  const action = linkAction(link.href, location.origin, config.publicOrigin);
  if (action.kind === 'local') {
    // Strip target=_blank for local documents so the native bridge stays loaded.
    if (link.href !== action.url || link.target) {event.preventDefault();location.assign(action.url);}
    return;
  }
  event.preventDefault();
  if (action.kind === 'external') void Browser.open({url:action.url}).catch(()=>notice('Bağlantı açılamadı. Lütfen yeniden dene.'));
  else if (action.kind === 'contact') window.prompt('İletişim e-posta adresi:', action.email);
  else notice('Güvenli olmayan bağlantı açılmadı.');
});
const visible = element => element && !element.hidden && element.getClientRects().length > 0;
export function handleBack() {
  const focused = document.activeElement;
  if (focused?.matches('input,textarea,select')) {focused.blur();return;}
  const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (dialog) {const event=new Event('cancel',{cancelable:true});if(dialog.dispatchEvent(event))dialog.close();return;}
  const details = [...document.querySelectorAll('details[open]')].find(visible);
  if (details) {details.open=false;details.querySelector?.('summary')?.focus();return;}
  for (const [panel, close] of [['commander-change-panel','commander-change-close'],['commander-profile','commander-profile-close'],['friends-panel','friends-close'],['home-play-panel','play-lobby-back']]) {
    if (visible(document.getElementById(panel))) {document.getElementById(close)?.click();return;}
  }
  // Hardware Back never abandons or detaches an active match. Explicit Leave still works.
  const parameters = new URLSearchParams(location.search);
  if (visible(document.getElementById('game')) || parameters.has('auctionCode') || parameters.has('code')) {
    notice('Maç korunuyor. Ayrılmak için oyundaki “Odadan ayrıl / Maçtan ayrıl” düğmesini kullan.');
    return;
  }
  if (location.pathname !== '/' && location.pathname !== '/index.html') {location.replace('/');return;}
  void App.minimizeApp().catch(()=>{});
}
function changeState(isActive) {
  if (isActive === active) return;
  active=isActive;
  // Reuse existing lifecycle hooks; never synthesize a game result or pause server time.
  window.dispatchEvent(new Event(isActive ? 'hero:native-resume' : 'hero:native-pause'));
  window.dispatchEvent(new Event(isActive ? 'pageshow' : 'pagehide'));
  document.dispatchEvent(new Event('visibilitychange'));
  if (isActive) window.dispatchEvent(new Event('focus'));
}
if (Capacitor.isNativePlatform()) {
  void App.addListener('backButton', handleBack);
  void App.addListener('appStateChange', ({isActive})=>changeState(isActive));
}
