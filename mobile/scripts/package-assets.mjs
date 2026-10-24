import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Keep the API's image paths and MIME types: server responses and SSE remain
// untouched, and every portrait still loads locally without a second download.
export const MAX_IMAGE_EDGE = 640;
export const MAX_WEB_BYTES = 20_000_000;
export async function filesIn(directory, prefix = '') {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, item.name);
    if (item.isDirectory()) files.push(...await filesIn(path.join(directory, item.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

export async function packageImages(root, out) {
  const roster = JSON.parse(await readFile(path.join(root, 'commander-original-roster.json'), 'utf8'));
  const heroes = roster.characters;
  if (!Array.isArray(heroes) || heroes.length !== 50) throw Error('Review Android portrait coverage after roster change');
  const required = new Set(heroes.map(hero => hero.portrait));
  // Include CSS backgrounds and commander art as well as server-driven heroes.
  for (const file of await filesIn(out)) {
    if (!/\.(?:html|css|js)$/.test(file)) continue;
    const source = await readFile(path.join(out, file), 'utf8');
    for (const match of source.matchAll(/["'`]((?:\/images\/)[^"'`\r\n<>]+)["'`]/g)) {
      if (match[1].includes('${')) continue;
      required.add(decodeURIComponent(match[1].split(/[?#]/)[0]));
    }
  }
  // Tiny vector fallbacks may be selected dynamically by commander ID.
  for (const file of await readdir(path.join(root, 'public/images'))) {
    if (file.endsWith('.svg')) required.add('/images/' + file);
  }
  const retained = [];
  for (const url of [...required].sort()) {
    if (!url.startsWith('/images/') || url.includes('..')) throw Error('Invalid bundled image path: ' + url);
    const relative = url.slice(1), src = path.join(root, 'public', relative), dest = path.join(out, relative);
    const original = await readFile(src); // Fail the build on a missing portrait.
    let bytes = original;
    if (/\.(png|webp)$/.test(url)) {
      const image = sharp(original).resize({width:MAX_IMAGE_EDGE, height:MAX_IMAGE_EDGE, fit:'inside', withoutEnlargement:true});
      // Preserve PNG alpha and true colour. No palette quantization or cropping.
      bytes = url.endsWith('.png')
        ? await image.png({compressionLevel:9, adaptiveFiltering:true}).toBuffer()
        : await image.webp({quality:88, alphaQuality:100, effort:6}).toBuffer();
    }
    await mkdir(path.dirname(dest), {recursive:true});
    await writeFile(dest, bytes);
    retained.push({path:relative, sourceBytes:original.length, bundledBytes:bytes.length});
  }
  const omitted = (await filesIn(path.join(root, 'public/images')))
    .filter(file => !required.has('/images/' + file)).map(file => 'images/' + file);
  return {heroCount:heroes.length, maxImageEdge:MAX_IMAGE_EDGE, retained, omitted};
}

export async function checkPackageSize(out, images) {
  const files = await filesIn(out);
  let totalBytes = 0;
  for (const file of files) totalBytes += (await stat(path.join(out, file))).size;
  if (totalBytes > MAX_WEB_BYTES) throw Error(`Android web assets exceed ${MAX_WEB_BYTES} bytes: ${totalBytes}`);
  return {...images, webBytes:totalBytes, maxWebBytes:MAX_WEB_BYTES};
}
