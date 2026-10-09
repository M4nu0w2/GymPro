# GymPro

Web app per la palestra pensata per iPhone: si installa sulla schermata Home (PWA), ha un'interfaccia in stile iOS nativo e funziona completamente offline. I dati stanno sul telefono (IndexedDB). Se vuoi, puoi attivare un account gratuito su Supabase per backup nel cloud e sincronizzazione tra dispositivi.

## Funzioni

- **Home**: card "Prossimo allenamento" con la scheda suggerita (la successiva nella rotazione) e un grande tasto Inizia. Se c'è un allenamento aperto diventa "Riprendi allenamento". Sotto trovi la streak, la settimana con i giorni allenati, il volume settimanale, gli ultimi record e l'accesso rapido alle schede.
- **Schede**: crea, modifica, duplica, elimina e riordina gli esercizi. Il recupero si sceglie da preset o a mano, i nomi si autocompletano e ogni esercizio può avere un gruppo muscolare (facoltativo).
- **Condivisione**: da una scheda tocca ⋯ → **Condividi** per avere link e QR code. La scheda è compressa (lz-string) dentro il link, quindi non passa da nessun server. Si condivide solo la struttura, mai storico o pesi. Chi apre il link vede un'anteprima e deve confermare l'import.
- **Allenamento**: un esercizio per schermata. Si cambia esercizio scorrendo in orizzontale e in alto c'è l'indicatore di avanzamento. L'header mostra sempre il timer totale della sessione. Peso e rep sono precompilati e c'è il riquadro "Ultima volta". Puoi aggiungere serie extra, saltare un esercizio e correggere le serie. Se chiudi l'app, alla riapertura l'allenamento riprende da dove eri.
- **Progressione automatica**: se nell'ultima sessione hai completato tutte le serie raggiungendo le rep target (il massimo del range, es. 10 per "8-10"), il peso viene precompilato con l'aumento e compare l'etichetta "↑ Prova 62,5 kg". Un tocco sull'etichetta torna al peso precedente. L'aumento è di +2,5 kg di default e si cambia in Impostazioni.
- **Timer di recupero**: si basa sull'orario di fine, quindi resta preciso anche con lo schermo bloccato. Negli ultimi 3 secondi fa un beep; alla fine suona un segnale diverso e compare un banner animato, ma solo se l'app è in primo piano (non ci sono notifiche push). Wake Lock tiene lo schermo acceso.
- **Gruppo muscolare**: petto, dorso, spalle, bicipiti, tricipiti, gambe, glutei, addome o altro. La prima volta che usi un esercizio senza tag l'app lo chiede in modo discreto (puoi saltare la domanda). La scelta vale per quel nome di esercizio ovunque compaia.
- **Progressi**: elenco sessioni con badge 🏆 per i record. Per ogni esercizio ci sono grafici (peso max, 1RM stimato, volume). Le statistiche includono streak in giorni e settimane, calendario mensile, volume settimanale per gruppo muscolare (gli esercizi senza tag vanno in "Non assegnato") e l'elenco dei record.
- **Record personali**: quando batti il peso massimo o il 1RM stimato di un esercizio, durante l'allenamento parte un'animazione con suono.
- **Corpo**: peso corporeo e misure (vita, petto, braccio, coscia, fianchi) con data e grafico dell'andamento.
- **Backup**: export/import JSON completo (include tag muscolari e misure; i backup della versione precedente sono ancora accettati) ed export delle schede in CSV.

Stack: Vite + React + TypeScript, Tailwind CSS v4, Dexie, vite-plugin-pwa, Recharts, Supabase (facoltativo), lz-string, qrcode-generator.

## Avvio in locale

Serve Node.js 20 o più recente (testato con Node 24).

```bash
npm install
npm run dev
```

Apri http://localhost:5173. Il comando usa `--host`, quindi Vite stampa anche un indirizzo di rete (es. `http://192.168.1.10:5173`) che puoi aprire dall'iPhone sulla stessa Wi‑Fi.

> In dev su http da un altro dispositivo, service worker, Wake Lock e installazione non sono attivi perché richiedono HTTPS. Per provarli usa la versione pubblicata.

## Account e sincronizzazione (Supabase, facoltativo)

Senza configurazione l'app funziona in **modalità solo locale** e in Impostazioni mostra "Solo locale". Per attivare il cloud segui questi passi.

### 1. Crea il progetto
1. Registrati su [supabase.com](https://supabase.com) (il piano Free basta) e premi **New project**.
2. Scegli nome, password del database e una regione vicina (es. *Central EU (Frankfurt)*), poi attendi la creazione.

### 2. Crea tabella, funzione e policy
1. Nel progetto apri **SQL Editor → New query**.
2. Incolla tutto il contenuto di [supabase/schema.sql](supabase/schema.sql) e premi **Run**.

Lo script crea:
- la tabella `records`: una riga per ogni scheda, sessione, metadato esercizio o misura, salvata come JSON, con `updated_at` (orario della modifica sul client) e `deleted` (tombstone per le cancellazioni);
- un trigger che imposta `server_updated_at`, usato come cursore per scaricare solo le novità;
- la **Row Level Security** con policy select/insert/update/delete limitate a `auth.uid() = user_id`: ogni utente vede solo i propri dati;
- la funzione `push_records`, che fa l'upsert in blocco con la regola "ultima modifica vince" (sovrascrive una riga solo se quella in arrivo è più recente).

Lo script si può rieseguire senza perdere dati.

### 3. Configura l'autenticazione
1. **Authentication → Sign In / Providers → Email**: deve essere attivo. Se vuoi accedere subito dopo la registrazione con password, disattiva "Confirm email".
2. **Authentication → URL Configuration**:
   - **Site URL**: l'indirizzo pubblicato, es. `https://<utente>.github.io/GymPro/`
   - **Redirect URLs**: aggiungi lo stesso indirizzo e `http://localhost:5173/` per lo sviluppo.
3. **Authentication → Emails → Templates → Magic Link**: aggiungi il codice nel testo, ad esempio:
   ```html
   <h2>Il tuo codice GymPro</h2>
   <p>Inserisci questo codice nell'app: <strong>{{ .Token }}</strong></p>
   <p>Oppure <a href="{{ .ConfirmationURL }}">accedi da qui</a>.</p>
   ```
   Fai lo stesso in **Confirm signup**. L'app usa il **codice a 6 cifre** perché su iPhone un link email si apre in Safari, che non condivide i dati con la web app installata sulla Home. Il codice invece si inserisce direttamente nell'app.

> Il server email incluso in Supabase invia pochi messaggi all'ora ed è pensato per i test. Per un uso reale configura un SMTP tuo in **Project Settings → Authentication → SMTP** (vanno bene Resend o Brevo, anche nei piani gratuiti).

### 4. Accedi con Apple (facoltativo)
Richiede l'**Apple Developer Program** (a pagamento).
1. Su developer.apple.com crea un **Services ID** con "Sign in with Apple", registra il dominio e come Return URL imposta `https://<progetto>.supabase.co/auth/v1/callback`. Crea anche una **Key** con Sign in with Apple.
2. In Supabase apri **Authentication → Providers → Apple**, attivalo e inserisci Services ID, Team ID, Key ID e chiave privata.
3. Imposta `VITE_AUTH_APPLE=true`.

Nella web app installata il login OAuth passa da un redirect: se su qualche versione di iOS non torna nell'app, usa il codice via email.

### 5. Variabili d'ambiente
Copia `.env.example` in `.env.local` e compila i valori (**Project Settings → API**):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<chiave anon / publishable>
VITE_AUTH_APPLE=false
```

La chiave anon è pubblica per definizione: i dati sono protetti dalla RLS. **Non usare mai la chiave `service_role`/secret.**

Per GitHub Pages crea le stesse tre variabili in **Settings → Secrets and variables → Actions → Variables**. Il workflow le passa già alla build.

### Come funziona la sincronizzazione
- **Offline-first**: Dexie resta la fonte locale e tutto funziona senza rete. Ogni modifica locale aggiorna `updatedAt` e finisce in una coda (outbox), cancellazioni comprese.
- La sincronizzazione parte al login, quando torna la connessione, quando riapri l'app, qualche secondo dopo ogni modifica e ogni 5 minuti. Lo stato è visibile in Impostazioni, dove c'è anche "Sincronizza ora".
- I conflitti si risolvono con l'**ultima modifica vince**, in base all'orario della modifica. Tutti i record hanno ID univoci (UUID; per i metadati degli esercizi la chiave è il nome normalizzato, così lo stesso esercizio coincide su tutti i dispositivi).
- **Primo login**: i dati già presenti sul dispositivo vengono caricati nell'account. Gli ID sono stabili, quindi un secondo upload non crea duplicati.
- **Esci** non cancella i dati locali. "Cancella tutti i dati" e "Ripristina backup", invece, quando sei collegato valgono anche per il cloud.

## Build e test

```bash
npm run build      # typecheck + build di produzione in dist/
npm run preview    # serve dist/ su http://localhost:4173
npm test           # unit test: CSV, statistiche, progressione, condivisione, migrazione Dexie, sync
```

Smoke test end-to-end con WebKit (il motore di Safari). Gira a 390×844 e 375×667, in modalità scura e chiara. Prepara un database della versione precedente e verifica che sopravviva all'aggiornamento, poi esegue un allenamento completo **offline** (con un ricaricamento a metà), progressione, record, swipe, statistiche, misure, condivisione e header che si riduce:

```bash
npx playwright install webkit     # solo la prima volta
npm run build && npm run preview  # in un terminale
npm run test:e2e                  # in un altro terminale
```

Gli screenshot vengono salvati nella cartella temporanea (`gympro-shots`) o in quella che passi come argomento.

Per rigenerare icone e splash screen (chiare e scure, per i vari iPhone) dopo aver modificato `scripts/icon.svg`:

```bash
npm run icons
```

## Pubblicazione gratuita (serve HTTPS)

L'app è statica: basta pubblicare la cartella `dist/`.

### GitHub Pages
Il workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) è già pronto:
1. Carica il progetto su GitHub, sul branch `main`.
2. In **Settings → Pages** scegli **GitHub Actions** come Source.
3. Se usi Supabase, aggiungi le variabili (vedi sopra).
4. A ogni push su `main` l'app viene pubblicata su `https://<utente>.github.io/<nome-repo>/`.

### Vercel / Netlify
Importa il repository: il build command è `npm run build` e l'output è `dist`. Imposta le variabili `VITE_SUPABASE_*` nel pannello del servizio.

## Aggiungerla alla Home su iPhone

1. Apri l'indirizzo pubblicato con **Safari**.
2. Tocca **Condividi** → **Aggiungi alla schermata Home** → **Aggiungi**.
3. Apri GymPro dall'icona: parte a schermo intero, con splash screen, e funziona offline.

## Note importanti

- **Aggiornamento dalla versione precedente**: il database passa allo schema v2 con una migrazione Dexie. Schede e storico restano, alle sessioni viene aggiunto `updatedAt` e nascono le tabelle per i tag muscolari e le misure corporee. Il tema ora segue quello di sistema (si cambia in Impostazioni → Aspetto).
- **Senza account i dati sono solo sul telefono**: fai spesso **Impostazioni → Esporta backup** o attiva la sincronizzazione.
- I dati della web app installata sono separati da quelli di Safari. Un **link condiviso** aperto dall'iPhone si apre in Safari: per importarlo nella web app copia il link e usa **Schede → Importa → Da link**.
- **Suono**: su iPhone la vibrazione non è supportata. Safari sblocca l'audio al primo tocco e l'app lo gestisce da sola. Controlla il tasto silenzioso.
- **Wake Lock** richiede iOS 16.4 o successivo.
- **Prestazioni**: il vetro sfocato è usato solo su tab bar, header, sheet e banner. Durante l'allenamento l'unica superficie sfocata è l'header (più la capsula del timer), e il timer totale si aggiorna senza ridisegnare tutta la schermata.

## Formato CSV

```
scheda;esercizio;serie;rep;recupero_sec;note;muscolo
Push A;Panca piana;4;8-10;120;Fermo al petto;petto
Push A;Military press;3;8;90;;spalle
```

| Colonna | Obbligatoria | Valori |
|---|---|---|
| scheda | sì | nome della scheda: le righe con lo stesso nome finiscono nella stessa scheda |
| esercizio | sì | nome dell'esercizio |
| serie | no (3) | intero da 1 a 20 |
| rep | no (10) | numero (`8`) o range (`8-10`) |
| recupero_sec | no (90) | secondi, da 0 a 900 |
| note | no | testo libero |
| muscolo | no | petto, dorso, spalle, bicipiti, tricipiti, gambe, glutei, addome, altro (accetta anche sinonimi come "schiena") |

I file senza la colonna `muscolo` funzionano come prima. Il separatore può essere `;` (consigliato per Excel in italiano) o `,`.

## Struttura

```
src/
  types.ts            modello dati (Plan, Session, SetLog, ExerciseMeta, BodyEntry)
  db.ts               schema Dexie versionato (v1 → v2)
  lib/                logica pura: csv, backup, stats, workout (prefill/progressione), share, plans, exercises…
  lib/sync/           tracker (outbox), engine (push/pull LWW), supabase, gestore + auth
  hooks/              useRestTimer, useWakeLock, useData, useNow
  components/         UI iOS: Screen, Sheet, Group/Row, Segmented, Stepper, RestTimer, Celebration…
  screens/            home/, plans/, workout/, progress/, settings/
supabase/schema.sql   tabella, RLS, policy, funzione push_records
scripts/              generate-icons.mjs, icon.svg, smoke-test.mjs
```
