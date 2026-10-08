// Genera tutte le icone PNG a partire da scripts/icon.svg
// Uso: npm run icons
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
await mkdir(out, { recursive: true });

const svg = await readFile(join(root, 'scripts', 'icon.svg'), 'utf8');

// Maskable: il manubrio va ridotto per stare nella safe zone (cerchio 80%)
const maskable = svg.replace(
  '<g transform="rotate(-35 256 256)">',
  '<g transform="translate(256 256) scale(0.7) translate(-256 -256) rotate(-35 256 256)">',
);

// Favicon SVG con angoli arrotondati (lo sfondo pieno serve solo per iOS / manifest)
const favicon = svg.replace(
  '<rect width="512" height="512" fill="url(#bg)"/>',
  '<rect width="512" height="512" rx="112" fill="url(#bg)"/>',
);

const targets = [
  // iOS: niente trasparenza, flatten su sfondo pieno
  { file: 'apple-touch-icon.png', size: 180, src: svg, flatten: true },
  { file: 'icon-192.png', size: 192, src: svg },
  { file: 'icon-512.png', size: 512, src: svg },
  { file: 'icon-maskable-512.png', size: 512, src: maskable, flatten: true },
  { file: 'favicon-32.png', size: 32, src: favicon },
];

for (const t of targets) {
  let img = sharp(Buffer.from(t.src), { density: 384 }).resize(t.size, t.size);
  if (t.flatten) img = img.flatten({ background: '#0b0d10' });
  await img.png().toFile(join(out, t.file));
  console.log('✓', t.file);
}
await writeFile(join(out, 'favicon.svg'), favicon);
console.log('✓ favicon.svg');
