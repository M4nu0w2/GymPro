// Smoke test end-to-end su WebKit (motore di Safari) con viewport iPhone.
// Uso: npm run build && npx vite preview --port 4173   (in un altro terminale)
//      node scripts/smoke-test.mjs [cartella-screenshot]
import { webkit, devices } from 'playwright';
import lz from 'lz-string';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.argv[2] ?? join(tmpdir(), 'gympro-shots');
await mkdir(OUT, { recursive: true });

const errors = [];
let currentPage = null;
const browser = await webkit.launch();
const watchdog = setTimeout(async () => {
  console.log('WATCHDOG: test bloccato');
  await currentPage?.screenshot({ path: join(OUT, 'FAIL.png') }).catch(() => {});
  process.exit(2);
}, 420000);

const DAY = 86400000;

/** Crea il database com'era nella versione precedente dell'app (schema Dexie v1 = IDB v10) */
async function seedLegacyDb(page) {
  await page.evaluate(
    ({ day }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('gympro', 10);
        req.onupgradeneeded = () => {
          const db = req.result;
          const plans = db.createObjectStore('plans', { keyPath: 'id' });
          plans.createIndex('name', 'name');
          plans.createIndex('createdAt', 'createdAt');
          const s = db.createObjectStore('sessions', { keyPath: 'id' });
          s.createIndex('planId', 'planId');
          s.createIndex('startedAt', 'startedAt');
          s.createIndex('status', 'status');
          s.createIndex('exerciseKeys', 'exerciseKeys', { multiEntry: true });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['plans', 'sessions'], 'readwrite');
          const t0 = Date.now() - 2 * day;
          tx.objectStore('plans').put({
            id: 'legacy-plan',
            name: 'Legacy',
            createdAt: t0 - day,
            updatedAt: t0 - day,
            exercises: [{ id: 'e1', name: 'Panca piana', sets: 2, reps: '8', restSec: 90 }],
          });
          tx.objectStore('sessions').put({
            id: 'legacy-session',
            planId: 'legacy-plan',
            planName: 'Legacy',
            startedAt: t0,
            endedAt: t0 + 3000000,
            status: 'done',
            exercises: [{ name: 'Panca piana', key: 'panca piana', sets: 2, reps: '8', restSec: 90 }],
            sets: [1, 2].map((n) => ({
              id: 'ls' + n,
              exerciseName: 'Panca piana',
              exerciseKey: 'panca piana',
              setNumber: n,
              weight: 60,
              reps: 8,
              timestamp: t0 + n * 1000,
            })),
            exerciseKeys: ['panca piana'],
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { day: DAY },
  );
}

async function setup(deviceName, scheme) {
  const ctx = await browser.newContext({ ...devices[deviceName], colorScheme: scheme });
  const page = await ctx.newPage();
  currentPage = page;
  page.setDefaultTimeout(10000);
  const tag = `${deviceName.replace(/\W+/g, '-')}-${scheme}`;
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`[${tag}] console: ${m.text()}`));
  let step = 0;
  const shot = async (name) => {
    await page.waitForTimeout(500); // fine animazioni
    console.log(`  [${tag}] ${name}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`[${tag}] overflow orizzontale di ${overflow}px in "${name}"`);
    await page.screenshot({ path: join(OUT, `${tag}-${String(++step).padStart(2, '0')}-${name}.png`) });
  };
  const expectText = (text, timeout = 5000) => page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
  const btn = (name) => page.getByRole('button', { name, exact: false }).filter({ visible: true }).first();
  const tab = (name) => page.getByRole('navigation').getByRole('button', { name, exact: true });
  const check = (cond, msg) => {
    if (!cond) errors.push(`[${tag}] ${msg}`);
  };
  return { ctx, page, tag, shot, expectText, btn, tab, check };
}

async function fullRun(deviceName, scheme) {
  const { ctx, page, shot, expectText, btn, tab, check } = await setup(deviceName, scheme);

  // --- Dati della versione precedente: devono sopravvivere all'aggiornamento ---
  await page.goto(BASE + 'favicon.svg');
  await seedLegacyDb(page);
  await page.goto(BASE);
  await expectText('Prossimo allenamento');
  await expectText('Legacy');
  await shot('home-dati-migrati');
  const version = await page.evaluate(
    () => new Promise((r) => { const q = indexedDB.open('gympro'); q.onsuccess = () => { r(q.result.version); q.result.close(); }; }),
  );
  check(version === 20, `versione IndexedDB attesa 20 (Dexie v2), trovata ${version}`);

  await tab('Progressi').click();
  await expectText('Legacy');
  await shot('storico-migrato');

  // --- Service worker attivo, poi offline per tutto l'allenamento ---
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });

  // --- Import CSV con colonna muscolo ---
  await tab('Schede').click();
  await btn('Importa schede').click();
  const csv = join(OUT, 'good.csv');
  await writeFile(
    csv,
    '﻿scheda;esercizio;serie;rep;recupero_sec;note;muscolo\nPush A;Panca piana;2;8-10;3;Fermo al petto;\nPush A;Military press;1;8;0;;spalle\n',
  );
  const chooser = page.waitForEvent('filechooser');
  await btn('Scegli file').click();
  await (await chooser).setFiles(csv);
  await expectText('Military press');
  await shot('import-anteprima');
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await shot('schede');

  await ctx.setOffline(true);

  // --- Allenamento ---
  await page.getByRole('button', { name: 'Inizia allenamento' }).first().click();
  await expectText('Esercizio 1 di 2');
  // progressione: ultima volta 2×8 a 60 kg con target 8 → ma la scheda nuova ha target 8-10: il target dell'ultima sessione è 8
  await expectText('Prova');
  const w1 = await page.getByLabel('Peso', { exact: true }).first().inputValue();
  check(w1 === '62,5', `progressione: peso atteso 62,5, trovato "${w1}"`);
  // domanda muscolo (Panca non ha tag)
  await expectText('Che muscolo allena?');
  await shot('allenamento-progressione');
  await page.getByRole('button', { name: 'Petto', exact: true }).click();
  await page.getByText('Che muscolo allena?').waitFor({ state: 'detached' });

  await btn('Serie completata').click();
  await expectText('Nuovo record!');
  await shot('record');
  // timer compatto (dopo un record resta ridotto), poi banner a fine recupero
  await expectText('Recupero finito', 8000);
  await shot('banner-fine-recupero');
  await page.getByText('Recupero finito').waitFor({ state: 'detached', timeout: 6000 });

  // reload a metà allenamento, offline
  await page.reload();
  await expectText('Serie 2', 8000);
  const w2 = await page.getByLabel('Peso', { exact: true }).first().inputValue();
  check(w2 === '62,5', `serie 2 dopo reload offline: atteso 62,5, trovato "${w2}"`);
  await shot('ripreso-offline');

  // swipe al secondo esercizio e ritorno (scroll-snap)
  await page.evaluate(() => {
    const p = document.querySelector('.pager');
    p.scrollTo({ left: p.clientWidth, behavior: 'instant' });
  });
  await page.waitForTimeout(600);
  await expectText('Esercizio 2 di 2');
  const sel = await page.locator('[role=tab][aria-selected=true]').getAttribute('aria-label');
  check(sel?.startsWith('Military'), `indicatore dopo swipe: atteso Military press, trovato "${sel}"`);
  await shot('swipe-esercizio-2');
  await page.locator('[role=tab]').first().click();
  await page.waitForTimeout(700);

  await btn('Serie completata').click(); // serie 2 panca → recupero 3s, passa a Military
  const riduci = page.getByRole('button', { name: 'Riduci', exact: true });
  await riduci.waitFor({ timeout: 3000 }).then(() => riduci.click()).catch(() => {});
  await page.getByRole('heading', { name: 'Military press' }).waitFor();
  await page.getByLabel('Peso', { exact: true }).nth(0).waitFor();
  const peso = page.locator('section[aria-label="Military press"]').getByLabel('Peso', { exact: true });
  await peso.fill('40');
  await page.locator('section[aria-label="Military press"]').getByRole('button', { name: 'Serie completata' }).click();
  await expectText('Termina e salva');
  await btn('Termina e salva').click();
  await expectText('Ottimo lavoro');
  await shot('riepilogo');
  await page.getByRole('button', { name: 'Chiudi', exact: true }).last().click();
  await page.waitForTimeout(400);

  // --- Statistiche (ancora offline) ---
  await tab('Progressi').click();
  await page.getByRole('tab', { name: 'Statistiche' }).click();
  await expectText('Volume per muscolo');
  await expectText('Petto');
  await expectText('Spalle');
  await shot('statistiche');
  await page.getByRole('tab', { name: 'Sessioni' }).click();
  await expectText('PR');
  await shot('storico-badge-pr');

  // --- Corpo ---
  await page.getByRole('tab', { name: 'Corpo' }).click();
  await btn('Nuova misurazione').click();
  await page.getByLabel('Peso', { exact: true }).fill('80,4');
  await page.getByLabel('Vita').fill('84');
  await page.getByRole('dialog').getByRole('button', { name: 'Salva', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await btn('Nuova misurazione').click();
  const d = new Date(Date.now() - 7 * DAY);
  await page.locator('input[type=date]').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  await page.getByLabel('Peso', { exact: true }).fill('81,2');
  await page.getByRole('dialog').getByRole('button', { name: 'Salva', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.locator('.recharts-area').first().waitFor({ timeout: 6000 });
  await shot('corpo');

  await ctx.setOffline(false);

  // --- Condivisione: sheet con QR, poi apertura di un link ---
  await tab('Schede').click();
  await page.getByRole('button', { name: 'Opzioni' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Condividi' }).click();
  await page.locator('[aria-label="QR code della scheda"] svg').waitFor();
  await shot('condividi-qr');
  await page.getByRole('button', { name: 'Chiudi' }).first().click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });

  const code = lz.compressToEncodedURIComponent(JSON.stringify({ v: 1, n: 'Gambe amico', e: [['Squat', 5, '5', 180, '', 'gambe'], ['Affondi', 3, '10-12', 90]] }));
  await page.goto(`${BASE}#scheda=${code}`);
  await expectText('Vuoi importare questa scheda?');
  await expectText('Gambe amico');
  await shot('link-anteprima');
  await page.getByRole('dialog').getByRole('button', { name: 'Importa', exact: true }).click();
  await expectText('importata');
  check(!(await page.evaluate(() => location.hash)), 'hash del link non rimosso dopo import');
  await tab('Schede').click();
  await expectText('Gambe amico');

  // --- Impostazioni ---
  await tab('Impostazioni').click();
  await expectText('Proponi aumento');
  await shot('impostazioni');
  await tab('Home').click();
  await expectText('settiman');
  await shot('home-finale');

  await ctx.close();
}

/** Giro rapido delle schermate principali nell'altra modalità colore */
async function visualRun(deviceName, scheme) {
  const { ctx, page, shot, expectText, btn, tab } = await setup(deviceName, scheme);
  await page.goto(BASE + 'favicon.svg');
  await seedLegacyDb(page);
  await page.goto(BASE);
  await expectText('Prossimo allenamento');
  await shot('home');
  await tab('Schede').click();
  await shot('schede');
  await tab('Progressi').click();
  await page.getByRole('tab', { name: 'Statistiche' }).click();
  await shot('statistiche');
  await tab('Impostazioni').click();
  await shot('impostazioni');
  // titolo grande che si riduce nella barra in vetro allo scroll
  await page.locator('[data-tab=settings] [data-scroll]').evaluate((el) => el.scrollTo({ top: 400 }));
  await page.waitForTimeout(500);
  const small = page.locator('[data-tab=settings] header p[aria-hidden=false]');
  if ((await small.count()) !== 1) errors.push('header compatto non visibile dopo lo scroll');
  await shot('impostazioni-scroll');
  await tab('Home').click();
  await btn('Inizia').click();
  await expectText('Serie completata');
  await shot('allenamento');
  await btn('Serie completata').click();
  await page.getByRole('button', { name: 'Espandi timer di recupero' }).waitFor();
  await page.waitForTimeout(2200); // fine celebrazione record
  await shot('timer-compatto');
  await page.getByRole('button', { name: 'Espandi timer di recupero' }).click();
  await page.getByRole('button', { name: 'Riduci', exact: true }).waitFor();
  await shot('timer-espanso');
  await ctx.close();
}

try {
  await fullRun('iPhone 13', 'dark'); // 390×844
  await fullRun('iPhone SE', 'light'); // 375×667
  await visualRun('iPhone 13', 'light');
  await visualRun('iPhone SE', 'dark');
} catch (e) {
  errors.push(`ERRORE: ${e.message.split('\n').slice(0, 4).join(' | ')}`);
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
