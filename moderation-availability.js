// A missing persisted block list must never mean that everyone is unblocked.
export function requireModerationForInteraction(ready,route){
 const peer=route==='/api/friends'||route.startsWith('/api/friend/')||route.startsWith('/api/friends/')||route.startsWith('/api/spectate')||['/api/join','/api/match','/api/rematch','/api/chat'].includes(route);
 if(!ready&&peer)throw Object.assign(Error('Oyuncu güvenlik kayıtları yüklenemedi. İletişim ve yeni eşleşmeler geçici olarak kapalı.'),{status:503});
}
