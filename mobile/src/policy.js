// Pure boundary rules shared by the native runtime, build and regression tests.
export function httpsOrigin(value, label = 'origin') {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error(`${label} must be a bare HTTPS origin (no credentials, path, query or fragment)`);
  }
  return url.origin;
}
export function readConfig(value) {
  const apiOrigin = httpsOrigin(value.apiOrigin, 'apiOrigin');
  const publicOrigin = httpsOrigin(value.publicOrigin, 'publicOrigin');
  if (apiOrigin !== publicOrigin) throw Error('The test API and public invite origin must be the same server.');
  return Object.freeze({apiOrigin, publicOrigin, configured: !new URL(apiOrigin).hostname.endsWith('.invalid')});
}
export function apiUrl(input, localOrigin, apiOrigin) {
  const url = new URL(input, localOrigin);
  if (url.origin !== localOrigin || !url.pathname.startsWith('/api/')) return null;
  return apiOrigin + url.pathname + url.search;
}
export function linkAction(input, localOrigin, publicOrigin) {
  let url;
  try { url = new URL(input, localOrigin); } catch { return {kind:'blocked'}; }
  if (url.username || url.password) return {kind:'blocked'};
  if (url.origin === localOrigin) {
    if (url.pathname.startsWith('/api/')) return {kind:'blocked'};
    if (url.pathname === '/privacy') url.pathname='/privacy.html';
    return {kind:'local', url:url.href};
  }
  if (url.origin === publicOrigin && ['/', '/privacy', '/privacy.html'].includes(url.pathname)) {
    // Only a room code may cross from an external link into the local game.
    const join = url.searchParams.get('join');
    const path = url.pathname === '/privacy' ? '/privacy.html' : url.pathname;
    return {kind:'local', url:localOrigin + path + (path === '/' && /^\d{3}$/.test(join || '') ? '?join='+join : '')};
  }
  if (url.protocol === 'https:') return {kind:'external', url:url.href};
  if (url.protocol === 'mailto:' && ['destek@heroauction.com.tr','mehmetakgul91@gmail.com'].includes(url.pathname)) return {kind:'contact', email:url.pathname};
  return {kind:'blocked'};
}
