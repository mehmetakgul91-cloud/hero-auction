/** Cosmetic melee weapon art. All paths use a 100 × 100 viewBox.
 * The rotating arm's transform-origin must be 50% 90%.
 * Contact is the leading physical edge before arm rotation, never a glow.
 * Existing CSS head/grip/guard children should be omitted for these weapons.
 */
export const DETAILED_WEAPON_GEOMETRY = Object.freeze({
  sword: Object.freeze({ viewBox: [0, 0, 100, 100], pivot: [50, 90], contact: [50, 4] }),
  axe: Object.freeze({ viewBox: [0, 0, 100, 100], pivot: [50, 90], contact: [84, 20] }),
  dagger: Object.freeze({ viewBox: [0, 0, 100, 100], pivot: [50, 90], contact: [50, 18] }),
});

const defs = `<defs>
 <linearGradient id="steel" x1="0" y1="0" x2="1" y2=".3"><stop stop-color="#56657a"/><stop offset=".22" stop-color="#c4d7e5"/><stop offset=".47" stop-color="#f5fbff"/><stop offset=".51" stop-color="#8ca3ba"/><stop offset=".8" stop-color="#5c728e"/><stop offset="1" stop-color="#d9e8f2"/></linearGradient>
 <linearGradient id="gold" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="#fff0ad"/><stop offset=".26" stop-color="#dba94c"/><stop offset=".52" stop-color="#9b6224"/><stop offset=".72" stop-color="#e6b557"/><stop offset="1" stop-color="#5b351e"/></linearGradient>
 <linearGradient id="wood" x1="0" x2="1"><stop stop-color="#2b1b19"/><stop offset=".28" stop-color="#ba8051"/><stop offset=".5" stop-color="#825031"/><stop offset="1" stop-color="#35231f"/></linearGradient>
 <linearGradient id="leather" x1="0" x2="1"><stop stop-color="#180f18"/><stop offset=".45" stop-color="#623139"/><stop offset="1" stop-color="#241320"/></linearGradient>
 <linearGradient id="obsidian" x1="0" y1="0" x2="1" y2=".6"><stop stop-color="#b8a7da"/><stop offset=".16" stop-color="#423452"/><stop offset=".48" stop-color="#1b1a2c"/><stop offset=".5" stop-color="#685182"/><stop offset=".78" stop-color="#252037"/><stop offset="1" stop-color="#b3a2d1"/></linearGradient>
 <radialGradient id="ruby" cx=".3" cy=".2"><stop stop-color="#ffbd98"/><stop offset=".25" stop-color="#f15157"/><stop offset=".7" stop-color="#971e37"/><stop offset="1" stop-color="#360f25"/></radialGradient>
 <radialGradient id="amethyst" cx=".3" cy=".2"><stop stop-color="#f4d7ff"/><stop offset=".3" stop-color="#b494ed"/><stop offset=".75" stop-color="#674393"/><stop offset="1" stop-color="#23192e"/></radialGradient>
</defs>`;

const art = {
 sword: `
 <!-- Broad two-plane blade, physically meeting at the contact tip. -->
 <path d="M50 4 61 25 60 64 55 72H45L40 64 39 25Z" fill="url(#steel)" stroke="#202737" stroke-width="1.5" stroke-linejoin="round"/>
 <path d="M50 4 43 27 44 63 50 69Z" fill="#d6e8ef" opacity=".65"/>
 <path d="M50 8 50 67 56 62 57 27Z" fill="#61758e" opacity=".65"/>
 <path d="M50 6 50 66M41 27 43 61M59 27 57 61" fill="none" stroke="#f2faff" stroke-width=".8"/>
 <path d="m48 32 2-4 2 4-2 4Zm0 11 2-4 2 4-2 4Z" fill="#465e78" stroke="#a9c0cc" stroke-width=".4"/>
 <!-- Curved solid crossguard, with separate steel end caps. -->
 <path d="M27 66 34 64 44 68H56L66 64 73 66 72 73 65 72 57 75H43L35 72 28 73Z" fill="url(#gold)" stroke="#3a2522" stroke-width="1.5" stroke-linejoin="round"/>
 <path d="m29 67 6-1 9 4h12l9-4 6 1" fill="none" stroke="#ffedb0" stroke-width="1.1"/>
 <path d="m28 67 5-1-1 5-4 1m44-5-5-1 1 5 4 1" fill="#b9c6d7" stroke="#303447" stroke-width=".7"/>
 <path d="M45 75H55L54 92H46Z" fill="url(#leather)" stroke="#211b27" stroke-width="1.5"/>
 <path d="m46 77 8 3m-8 1 8 3m-8 1 8 3m-8 1 8 3" stroke="#c6946b" stroke-width="1.1" opacity=".8"/>
 <path d="m50 65 6 6-6 7-6-7Z" fill="url(#gold)" stroke="#462b26" stroke-width="1"/>
 <path d="m50 67 3.7 4-3.7 4.5-3.7-4.5Z" fill="url(#ruby)" stroke="#ffcf80" stroke-width=".6"/>
 <path d="M45 91H55L57 95 50 99 43 95Z" fill="url(#gold)" stroke="#35232a" stroke-width="1.2"/>
 <path d="m50 92 2.3 3-2.3 2-2.3-2Z" fill="url(#ruby)"/>
 `,
 axe: `
 <!-- Slightly tapered hardwood haft, grip centered on the rotation pivot. -->
 <path d="m46 13 8-1 1 80-5 6-5-5Z" fill="url(#wood)" stroke="#241e25" stroke-width="1.8" stroke-linejoin="round"/>
 <path d="m49 17 1 49m1-45 1 43" stroke="#e1ac72" stroke-width=".65" opacity=".55"/>
 <!-- Forged back spike and massive crescent cutting head. -->
 <path d="M47 23 33 18 22 25 36 31 45 34Z" fill="url(#steel)" stroke="#222635" stroke-width="1.6"/>
 <path d="m24 25 13 2 9 4" fill="none" stroke="#e7f0f6" stroke-width="1"/>
 <path d="M51 21C64 23 74 16 77 9L84 20C84 32 79 46 67 53L59 44C66 40 67 33 60 32L51 33Z" fill="url(#steel)" stroke="#222635" stroke-width="1.7" stroke-linejoin="round"/>
 <!-- Large outer bevel preserves a readable silver crescent at small size. -->
 <path d="M77 9 84 20C84 32 79 46 67 53L64 48C74 39 78 27 77 17Z" fill="#d4e3ed"/>
 <path d="M80 19C80 31 75 42 65 49" fill="none" stroke="#f6fcff" stroke-width="1.3"/>
 <path d="M56 24C64 25 71 21 74 18 75 29 71 39 63 45L61 43C68 38 69 30 60 29H56Z" fill="#344254" stroke="#8398aa" stroke-width=".8"/>
 <path d="m62 26 3 2-3 2m7-5 2 2-2 3m-5 5 2 1-2 3" fill="none" stroke="#adb8c3" stroke-width=".6" opacity=".8"/>
 <path d="M44 20 56 20 57 35 44 36Z" fill="url(#gold)" stroke="#35282a" stroke-width="1.3"/>
 <path d="M46 23H54M46 32H54" stroke="#f2ce7e" stroke-width=".8"/>
 <circle cx="50" cy="27.5" r="3" fill="#313b4d" stroke="#e7c474" stroke-width="1"/><path d="m48.5 27.5h3" stroke="#aebecb" stroke-width=".8"/>
 <path d="M45 68 55 67 55 91 50 95 45 91Z" fill="url(#leather)" stroke="#211b27" stroke-width="1.2"/>
 <path d="m46 70 8 3m-8 1 8 3m-8 1 8 3m-8 1 8 3m-8 1 8 3" stroke="#b0896b" stroke-width="1.2"/>
 <path d="M44.5 65H55.5V69H44.5ZM45 91H55L54 96H46Z" fill="url(#gold)" stroke="#35282a" stroke-width=".9"/>
 `,
 dagger: `
 <!-- Broad asymmetric facets, silver edge and dark assassin blade. -->
 <path d="M50 18 64 43 60 48 61 58 54 70H46L39 58 40 48 36 43Z" fill="url(#obsidian)" stroke="#171b28" stroke-width="1.7" stroke-linejoin="round"/>
 <path d="M50 18 39 43 43 48 42 57 49 67 46 68 39 58 40 48 36 43Z" fill="#d0d2e4"/>
 <path d="M50 18 64 43 60 48 61 58 54 70 52 67 58 56 57 47 61 43Z" fill="#a7adca"/>
 <path d="M50 24 50 65 57 55 55 46 58 42Z" fill="#76618f" opacity=".6"/>
 <path d="M50 24V64" stroke="#e2c7f8" stroke-width=".85"/>
 <path d="m47 44 3-5 3 5-3 5Zm1 11 2-3 2 3-2 3Z" fill="#c4a4e0" opacity=".8"/>
 <path d="M34 66 40 65 46 69H54L60 65 66 66 63 74 56 73 53 77H47L44 73 37 74Z" fill="url(#steel)" stroke="#242333" stroke-width="1.4" stroke-linejoin="round"/>
 <path d="m36 67 5 .5 5 3h8l5-3 5-.5" fill="none" stroke="#eff0ff" stroke-width=".8"/>
 <path d="M45.5 75H54.5L54 91H46Z" fill="#252132" stroke="#171a26" stroke-width="1.5"/>
 <path d="m46 77 8 3m-8 1 8 3m-8 1 8 3m-8 1 8 3" stroke="#9883b3" stroke-width="1.3"/>
 <path d="m50 67 5 5-5 6-5-6Z" fill="#514564" stroke="#c2bdd5" stroke-width=".9"/>
 <path d="m50 69 3 3-3 3.5-3-3.5Z" fill="url(#amethyst)"/>
 <path d="M46 91H54L57 94 50 99 43 94Z" fill="url(#steel)" stroke="#222333" stroke-width="1.2"/>
 <path d="m50 92 2.5 2-2.5 3-2.5-3Z" fill="url(#amethyst)"/>
 `,
};

/** Appends self-contained SVG art without relying on createElementNS or network.
 * Returns the image for supported weapons, null for hammer/slash/unknown.
 */
export function appendDetailedWeapon(document, arm, weapon) {
  if (!Object.prototype.hasOwnProperty.call(art, weapon)) return null;
  const image = document.createElement('img');
  image.className = 'hero-melee-detailed-art';
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.setAttribute('draggable', 'false');
  image.width = 100;
  image.height = 100;
  image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:contain;pointer-events:none;user-select:none;';
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">${defs}${art[weapon]}</svg>`);
  arm.append(image);
  return image;
}
