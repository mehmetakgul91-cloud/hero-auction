import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Server/API paths remain unchanged. Android serves explicit PNG aliases from
// native-image-aliases.json as image/webp; no auth or game payload is rewritten.
export const MAX_IMAGE_EDGE = 640;
// Includes the three new licensed arena tracks (6 MB), kept at source quality.
export const MAX_WEB_BYTES = 26_000_000;
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
  const retained = [], aliases = {};
  for (const url of [...required].sort()) {
    if (!url.startsWith('/images/') || url.includes('..')) throw Error('Invalid bundled image path: ' + url);
    const relative = url.slice(1), src = path.join(root, 'public', relative);
    const bundledPath = relative.endsWith('.png') ? relative.slice(0,-4)+'.lossless.webp' : relative;
    const dest = path.join(out, bundledPath);
    const original = await readFile(src); // Fail the build on a missing portrait.
    let bytes = original;
    if (/\.(png|webp)$/.test(url)) {
      const image = sharp(original).resize({width:MAX_IMAGE_EDGE, height:MAX_IMAGE_EDGE, fit:'inside', withoutEnlargement:true});
      // Preserve PNG alpha and true colour. No palette quantization or cropping.
      bytes = url.endsWith('.png')
        ? await image.webp({lossless:true, effort:6}).toBuffer()
        : await image.webp({quality:88, alphaQuality:100, effort:6}).toBuffer();
    }
    await mkdir(path.dirname(dest), {recursive:true});
    await writeFile(dest, bytes);
    if(bundledPath!==relative)aliases['/'+relative]=bundledPath;
    retained.push({path:bundledPath, sourcePath:relative, sourceBytes:original.length, bundledBytes:bytes.length});
  }
  const omitted = (await filesIn(path.join(root, 'public/images')))
    .filter(file => !required.has('/images/' + file)).map(file => 'images/' + file);
  await writeFile(path.join(out,'native-image-aliases.json'),JSON.stringify(aliases,null,2)+'\n');
  return {heroCount:heroes.length, maxImageEdge:MAX_IMAGE_EDGE, retained, omitted, aliases};
}

export async function checkPackageSize(out, images) {
  const files = await filesIn(out);
  let totalBytes = 0;
  for (const file of files) totalBytes += (await stat(path.join(out, file))).size;
  if (totalBytes > MAX_WEB_BYTES) throw Error(`Android web assets exceed ${MAX_WEB_BYTES} bytes: ${totalBytes}`);
  return {...images, webBytes:totalBytes, maxWebBytes:MAX_WEB_BYTES};
}

