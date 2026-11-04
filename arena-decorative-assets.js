// Immutable caching is restricted to content-addressed decorative images.
// Existing CSS, approved foreground artwork and other assets keep no-store.
const immutable=new Set([
 'images/arena-themes/ruins-side-extension-3a5fb26a.webp',
 'images/arena-themes/savanna-side-extension-88137c78.webp'
]);
export function arenaDecorativeCacheControl(relative){
 return immutable.has(relative)?'public, max-age=31536000, immutable':'no-store';
}
