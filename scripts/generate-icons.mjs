// Genera icone PNG e splash screen iOS a partire da scripts/icon.svg
// Uso: npm run icons
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
await mkdir(join(out, 'splash'), { recursive: true });

const svg = await readFile(join(root, 'scripts', 'icon.svg'), 'utf8');

// Maskable: il contenuto va ridotto per stare nella safe zone (cerchio 80%)
const maskable = svg
  .replace('<circle cx="256" cy="256" r="170"', '<circle cx="256" cy="256" r="150"')
  .replace('<g transform="rotate(-35 256 256)"', '<g transform="translate(256 256) scale(0.82) translate(-256 -256) rotate(-35 256 256)"');

// Favicon SVG con angoli arrotondati (lo sfondo pieno serve solo per iOS / manifest)
const favicon = svg.replace(/<rect width="512" height="512" fill="url\(#bg\)"\/>/, '<rect width="512" height="512" rx="114" fill="url(#bg)"/>')
  .replace('<rect width="512" height="512" fill="url(#shine)"/>', '<rect width="512" height="512" rx="114" fill="url(#shine)"/>');

const targets = [
  // iOS: niente trasparenza
  { file: 'apple-touch-icon.png', size: 180, src: svg, flatten: true },
  { file: 'icon-192.png', size: 192, src: svg },
  { file: 'icon-512.png', size: 512, src: svg },
  { file: 'icon-maskable-512.png', size: 512, src: maskable, flatten: true },
  { file: 'favicon-32.png', size: 32, src: favicon },
];

for (const t of targets) {
  let img = sharp(Buffer.from(t.src), { density: 384 }).resize(t.size, t.size);
  if (t.flatten) img = img.flatten({ background: '#9ee22c' });
  await img.png().toFile(join(out, t.file));
  console.log('✓', t.file);
}
await writeFile(join(out, 'favicon.svg'), favicon);
console.log('✓ favicon.svg');

// --- Splash screen (apple-touch-startup-image), chiare e scure ---
// [larghezza pt, altezza pt, densità]
const DEVICES = [
  [440, 956, 3], // iPhone 16 Pro Max
  [402, 874, 3], // iPhone 16 Pro
  [430, 932, 3], // 15/14 Pro Max, 15/16 Plus
  [393, 852, 3], // 16, 15, 15 Pro, 14 Pro
  [428, 926, 3], // 14 Plus, 13/12 Pro Max
  [390, 844, 3], // 14, 13, 13 Pro, 12
  [375, 812, 3], // 13 mini, 12 mini, 11 Pro, XS, X
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // SE 2/3, 8
];
const THEMES = { light: '#f2f2f7', dark: '#000000' };

// icona come "squircle" iOS
const iconRounded = svg
  .replace('<rect width="512" height="512" fill="url(#bg)"/>', '<rect width="512" height="512" rx="114" fill="url(#bg)"/>')
  .replace('<rect width="512" height="512" fill="url(#shine)"/>', '<rect width="512" height="512" rx="114" fill="url(#shine)"/>');

const links = [];
for (const [w, h, d] of DEVICES) {
  const pw = w * d;
  const ph = h * d;
  const iconSize = Math.round(120 * d);
  const icon = await sharp(Buffer.from(iconRounded), { density: 600 }).resize(iconSize, iconSize).png().toBuffer();
  for (const [theme, bg] of Object.entries(THEMES)) {
    const name = `splash/${theme}-${pw}x${ph}.png`;
    await sharp({ create: { width: pw, height: ph, channels: 3, background: bg } })
      .composite([{ input: icon, left: Math.round((pw - iconSize) / 2), top: Math.round((ph - iconSize) / 2) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(join(out, name));
    links.push(
      `    <link rel="apple-touch-startup-image" href="/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait) and (prefers-color-scheme: ${theme})" />`,
    );
  }
  console.log(`✓ splash ${w}x${h}@${d}x`);
}

// Aggiorna il blocco dei link in index.html
const htmlPath = join(root, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const block = `<!-- splash:start -->\n${links.join('\n')}\n    <!-- splash:end -->`;
await writeFile(htmlPath, html.replace(/<!-- splash:start -->[\s\S]*?<!-- splash:end -->/, block));
console.log('✓ index.html (splash link)');
