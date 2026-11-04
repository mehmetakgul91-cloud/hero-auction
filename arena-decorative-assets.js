import {versionedPortraitCachePaths} from './versioned-portrait-assets.js';
// Immutable caching is restricted to exact content-addressed image paths.
// Documents, scripts, styles, original artwork and other assets keep no-store.
const immutable=new Set([
 'images/arena-themes/ruins-side-extension-3a5fb26a.webp',
 'images/arena-themes/savanna-side-extension-88137c78.webp',
 ...versionedPortraitCachePaths
]);
export function arenaDecorativeCacheControl(relative){
 return immutable.has(relative)?'public, max-age=31536000, immutable':'no-store';
}
