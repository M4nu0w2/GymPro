// Smoke test end-to-end su WebKit (motore di Safari) con viewport iPhone.
// Uso: npm run build && npx vite preview --port 4173   (in un altro terminale)
//      node scripts/smoke-test.mjs [cartella-screenshot]
import { webkit, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.argv[2] ?? join(tmpdir(), 'gympro-shots');
await mkdir(OUT, { recursive: true });

const errors = [];
let step = 0;
let currentPage = null;
const browser = await webkit.launch();
// watchdog: evita blocchi infiniti
const watchdog = setTimeout(async () => {
  console.log('WATCHDOG: test bloccato');
  await currentPage?.screenshot({ path: join(OUT, 'FAIL.png') }).catch(() => {});
  process.exit(2);
}, 240000);

async function run(deviceName) {
  const ctx = await browser.newContext({ ...devices[deviceName], colorScheme: 'dark' });
  const page = await ctx.newPage();
  currentPage = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => errors.push(`[${deviceName}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${deviceName}] console: ${m.text()}`));
  const tag = deviceName.replace(/\W+/g, '-');

  const shot = async (name) => {
    await page.waitForTimeout(400); // fine animazioni
    console.log(`  [${deviceName}] ${name}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`[${deviceName}] overflow orizzontale di ${overflow}px in "${name}"`);
    await page.screenshot({ path: join(OUT, `${tag}-${String(++step).padStart(2, '0')}-${name}.png`) });
  };
  const expectText = async (text, timeout = 4000) => {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout });
  };
  const btn = (name) => page.getByRole('button', { name, exact: false }).first();

  await page.goto(BASE);
  await expectText('Nessuna scheda');
  await shot('vuoto');

  // --- Import CSV con errori ---
  const badCsv = join(OUT, 'bad.csv');
  await writeFile(badCsv, 'scheda;esercizio;serie;rep;recupero_sec;note\nA;Squat;x;8;90;\nA;;3;8;90;\n');
  await btn('Import').click();
  let chooser = page.waitForEvent('filechooser');
  await btn('Scegli file').click();
  await (await chooser).setFiles(badCsv);
  await expectText('Riga 2');
  await expectText('Riga 3');
  await shot('import-errori');

  // --- Import CSV valido (recupero di 3s per testare il timer) ---
  const goodCsv = join(OUT, 'good.csv');
  await writeFile(
    goodCsv,
    '﻿scheda;esercizio;serie;rep;recupero_sec;note\nPush A;Panca piana;2;8-10;3;Fermo al petto\nPush A;Military press;1;8;0;\n',
  );
  chooser = page.waitForEvent('filechooser');
  await btn('Altro file').click();
  await (await chooser).setFiles(goodCsv);
  await expectText('Military press');
  await shot('import-anteprima');
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await page.getByText('Importa schede').waitFor({ state: 'detached' });
  await expectText('Inizia allenamento');
  await shot('schede');

  // --- Editor scheda ---
  await page.getByText('Push A').first().click();
  await expectText('Modifica scheda');
  await page.getByRole('dialog').getByText('Panca piana').first().click();
  await expectText('Rimuovi esercizio');
  await shot('editor');
  await page.getByRole('button', { name: 'Chiudi' }).first().click();

  // --- Allenamento 1 ---
  await btn('Inizia allenamento').click();
  await expectText('Prima volta con questo esercizio');
  await page.getByLabel('Peso', { exact: true }).fill('60');
  await shot('allenamento-serie1');
  await btn('Serie completata').click();
  await expectText('Riduci');
  await shot('timer');
  // il timer basato su timestamp deve finire da solo dopo ~3s
  await page.getByText('Riduci').waitFor({ state: 'detached', timeout: 7000 });
  await expectText('Serie 2');
  const prefill = await page.getByLabel('Peso', { exact: true }).inputValue();
  if (prefill !== '60') errors.push(`[${deviceName}] prefill serie 2 atteso 60, trovato "${prefill}"`);
  await btn('Aumenta Peso').click();
  await btn('Serie completata').click();
  await btn('Riduci').click();
  await expectText('Military press');

  // --- Ripresa dopo chiusura ---
  await page.reload();
  await page.getByRole('heading', { name: 'Military press' }).waitFor();
  await shot('ripreso-dopo-reload');
  await page.getByLabel('Peso', { exact: true }).fill('40');
  await btn('Serie completata').click();
  await expectText('Termina e salva');
  await btn('Termina e salva').click();
  await expectText('Ottimo lavoro');
  await shot('riepilogo-1');
  await page.getByRole('button', { name: 'Chiudi', exact: true }).last().click();

  // --- Allenamento 2: precompilazione + record ---
  await page.getByRole('navigation').getByRole('button', { name: 'Schede' }).click();
  await btn('Inizia allenamento').click();
  await expectText('Ultima volta');
  await expectText('60kg × 8, 62,5kg × 8');
  const w = await page.getByLabel('Peso', { exact: true }).inputValue();
  if (w !== '60') errors.push(`[${deviceName}] prefill da ultima sessione atteso 60, trovato "${w}"`);
  await page.getByLabel('Peso', { exact: true }).fill('70');
  await btn('Serie completata').click();
  await page.getByRole('button', { name: 'Salta', exact: true }).click(); // salta il recupero
  // correggi la serie appena fatta
  await page.getByText('Serie 1').first().click();
  await expectText('Salva modifiche');
  await page.getByRole('dialog').getByRole('button', { name: 'Aumenta Rep' }).click();
  await btn('Salva modifiche').click();
  await expectText('70 kg × 9');
  await btn('Fine').click();
  await btn('Termina e salva').click();
  await expectText('record personale');
  await shot('riepilogo-record');
  await page.getByRole('button', { name: 'Chiudi', exact: true }).last().click();

  // --- Storico ---
  await expectText('Sessioni');
  await shot('storico-sessioni');
  await page.getByRole('button', { name: 'Esercizi', exact: true }).click();
  await page.getByRole('button', { name: /Panca piana/ }).first().click();
  await expectText('Record peso');
  await page.locator('.recharts-area').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(700);
  await shot('grafico-esercizio');
  await page.getByRole('button', { name: 'Chiudi' }).first().click();

  // --- Impostazioni + tema chiaro ---
  await btn('Impostazioni').click();
  await expectText('Esporta backup');
  await shot('impostazioni');
  await btn('Chiaro').click();
  await page.getByRole('navigation').getByRole('button', { name: 'Schede' }).click();
  await shot('schede-light');

  await ctx.close();
}

try {
  await run('iPhone 13'); // 390×844
  step = 0;
  await run('iPhone SE'); // 375×667, schermo piccolo
} catch (e) {
  errors.push(`ERRORE: ${e.message.split('\n').slice(0, 3).join(' | ')}`);
  await currentPage?.screenshot({ path: join(OUT, 'FAIL.png') }).catch(() => {});
} finally {
  await browser.close();
  clearTimeout(watchdog);
}

console.log(`Screenshot in ${OUT}`);
if (errors.length) {
  console.log('PROBLEMI:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Smoke test OK');
