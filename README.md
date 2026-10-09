# GymPro

Web app per la palestra pensata per iPhone: si installa sulla schermata Home (PWA), funziona offline e salva tutto in locale sul telefono (IndexedDB). Non c'è nessun backend.

- **Schede**: crea, modifica, duplica, elimina; riordina gli esercizi; recupero con preset (60/90/120/180 s) o personalizzato; autocompletamento dei nomi.
- **Import/Export**: import CSV (`;` o `,`) o JSON con anteprima e validazione per riga; template CSV scaricabile; backup completo in JSON e ripristino.
- **Allenamento**: peso e rep precompilati dall'ultima sessione, "Ultima volta: …", timer di recupero automatico, serie extra, salto esercizio, correzione delle serie, riepilogo con record personali. Se chiudi l'app a metà, l'allenamento riprende alla riapertura.
- **Timer**: basato sul timestamp di fine, quindi resta preciso anche con lo schermo bloccato; ±15 s, Salta, suono a fine recupero, Wake Lock per tenere lo schermo acceso.
- **Storico**: sessioni modificabili, grafici per esercizio (peso max, 1RM stimato, volume) e record personali. Lo storico è legato al nome dell'esercizio (senza distinguere maiuscole/minuscole), quindi è condiviso tra schede diverse.

Stack: Vite + React + TypeScript, Tailwind CSS v4, Dexie, vite-plugin-pwa, Recharts.

## Avvio in locale

Serve Node.js 20 o più recente (testato con Node 24).

```bash
npm install
npm run dev
```

Apri http://localhost:5173. Il comando usa `--host`, quindi Vite stampa anche un indirizzo di rete (es. `http://192.168.1.10:5173`) che puoi aprire dall'iPhone sulla stessa Wi‑Fi per provarla.

> In dev su http da un altro dispositivo, service worker, Wake Lock e installazione non sono attivi: richiedono HTTPS. Per provarli usa la versione pubblicata.

## Build e test

```bash
npm run build      # typecheck + build di produzione in dist/
npm run preview    # serve dist/ su http://localhost:4173
npm test           # unit test (CSV, statistiche, precompilazione, IndexedDB, backup)
```

Smoke test end-to-end con WebKit (il motore di Safari) a viewport iPhone 13 (390×844) e iPhone SE (375×667):

```bash
npx playwright install webkit   # solo la prima volta
npm run build && npm run preview  # in un terminale
npm run test:e2e                  # in un altro terminale
```

Gli screenshot vengono salvati nella cartella temporanea di sistema (`gympro-shots`), oppure nella cartella che passi come argomento.

Per rigenerare le icone dopo aver modificato `scripts/icon.svg`:

```bash
npm run icons
```

## Pubblicazione gratuita (serve HTTPS)

L'app è statica: basta pubblicare la cartella `dist/`. Tutti i servizi qui sotto offrono HTTPS gratis.

### Vercel
1. Carica il progetto su GitHub.
2. Su [vercel.com](https://vercel.com) scegli **Add New → Project** e importa il repository.
3. Vercel riconosce Vite in automatico (build `npm run build`, output `dist`). Premi **Deploy**.

### Netlify
1. Su [netlify.com](https://netlify.com) scegli **Add new site → Import an existing project** e collega il repository.
2. Build command `npm run build`, publish directory `dist`.
3. Senza Git: esegui `npm run build` e trascina la cartella `dist` su [app.netlify.com/drop](https://app.netlify.com/drop).

### GitHub Pages
Il workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) è già pronto:
1. Carica il progetto su GitHub, sul branch `main`.
2. Nel repository apri **Settings → Pages** e come **Source** scegli **GitHub Actions**.
3. A ogni push su `main` l'app viene pubblicata su `https://<utente>.github.io/<nome-repo>/`.

La variabile `BASE_PATH` serve a far funzionare l'app in una sottocartella. Il workflow la imposta da solo. Per una build manuale: `BASE_PATH=/nome-repo/ npm run build`.

## Aggiungerla alla Home su iPhone

1. Apri l'indirizzo pubblicato con **Safari**. Deve essere Safari: le altre app non permettono di installarla.
2. Tocca **Condividi** (il quadrato con la freccia verso l'alto).
3. Scorri e tocca **Aggiungi alla schermata Home**, poi **Aggiungi**.
4. Apri GymPro dall'icona: parte a schermo intero e funziona anche offline.

Gli aggiornamenti vengono scaricati in automatico la volta successiva che apri l'app con la connessione attiva.

## Note importanti

- **I dati sono solo sul telefono.** Se elimini l'app dalla Home o cancelli i dati di Safari, li perdi. Fai spesso **Impostazioni → Esporta backup** e salva il file su File o iCloud. Per ripristinare usa **Ripristina backup**.
- I dati della PWA installata sono separati da quelli di Safari: un backup fatto in Safari va ripristinato dentro l'app installata.
- **Suono**: su iPhone la Vibration API non è supportata, quindi la fine del recupero viene segnalata con suono e animazione. Safari sblocca l'audio solo dopo il primo tocco, e l'app se ne occupa da sola. Se non senti nulla, controlla che il tasto silenzioso sia disattivato e il volume alto.
- **Wake Lock** (schermo sempre acceso durante l'allenamento) richiede iOS 16.4 o successivo. Se lo schermo si blocca comunque, il timer resta corretto perché si basa sull'orario di fine, ma il suono parte solo con l'app in primo piano.

## Formato CSV

```
scheda;esercizio;serie;rep;recupero_sec;note
Push A;Panca piana;4;8-10;120;Fermo al petto
Push A;Military press;3;8;90;
```

| Colonna | Obbligatoria | Valori |
|---|---|---|
| scheda | sì | nome della scheda: le righe con lo stesso nome finiscono nella stessa scheda |
| esercizio | sì | nome dell'esercizio |
| serie | no (3) | intero da 1 a 20 |
| rep | no (10) | numero (`8`) o range (`8-10`) |
| recupero_sec | no (90) | secondi, da 0 a 900 |
| note | no | testo libero |

Il separatore può essere `;` (consigliato per Excel in italiano) o `,`. Il BOM UTF‑8 e i campi tra virgolette sono gestiti.

## Struttura

```
src/
  types.ts            modello dati (Plan, PlanExercise, Session, SetLog)
  db.ts               schema Dexie
  lib/                logica pura: csv, backup, stats, workout, audio, settings, files
  hooks/              useRestTimer, useWakeLock, useData, useNow
  components/         UI riutilizzabile (Stepper, Sheet, RestTimer, Feedback…)
  screens/            plans/, workout/, history/, settings/
scripts/              generate-icons.mjs, icon.svg, smoke-test.mjs
```
