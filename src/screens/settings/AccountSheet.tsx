import { useState } from 'react';
import { useFeedback } from '../../components/Feedback';
import { IconApple, IconMail } from '../../components/Icons';
import { Button, Segmented, Sheet, inputCls } from '../../components/ui';
import { sendEmailCode, signInWithApple, signInWithPassword, signUp, verifyEmailCode } from '../../lib/sync';
import { appleLoginEnabled } from '../../lib/sync/supabase';

type Mode = 'code' | 'password';

/** Accesso: codice via email (consigliato nella web app installata), email + password, Apple */
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Account">
      {open && <AccountForm onDone={onClose} />}
    </Sheet>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(translate((e as Error).message), 'error');
    } finally {
      setBusy(false);
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div className="space-y-4 pb-2">
      <div className="text-center">
        <h2 className="text-[22px] font-bold">Salva i tuoi dati nel cloud</h2>
        <p className="mx-auto mt-1 max-w-xs text-[15px] leading-snug text-muted">
          Schede, storico e misure sincronizzati sui tuoi dispositivi. L'app continua a funzionare offline.
        </p>
      </div>

      {appleLoginEnabled && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(signInWithApple)}
            className="tap flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-black text-[17px] font-semibold text-white dark:bg-white dark:text-black"
          >
            <IconApple size={20} /> Accedi con Apple
          </button>
          <div className="flex items-center gap-3 text-[13px] text-muted">
            <span className="h-px flex-1 bg-line" /> oppure <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setCodeSent(false);
        }}
        options={[
          { value: 'code', label: 'Codice via email' },
          { value: 'password', label: 'Password' },
        ]}
      />

      <input
        className={inputCls}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        placeholder="nome@email.it"
        aria-label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={codeSent}
      />

      {mode === 'code' && !codeSent && (
        <>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!validEmail || busy}
            onClick={() =>
              run(async () => {
                await sendEmailCode(email.trim());
                setCodeSent(true);
                toast('Email inviata');
              })
            }
          >
            <IconMail size={19} /> Invia codice
          </Button>
          <p className="px-2 text-center text-[13px] leading-snug text-muted">
            Riceverai un codice a 6 cifre da inserire qui: funziona anche nell'app aggiunta alla schermata Home. Se l'account non esiste viene creato.
          </p>
        </>
      )}

      {mode === 'code' && codeSent && (
        <>
          <input
            className={inputCls + ' rounded-num text-center !text-[28px] font-bold tracking-[0.3em]'}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            aria-label="Codice"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={code.length < 6 || busy}
            onClick={() =>
              run(async () => {
                await verifyEmailCode(email.trim(), code);
                toast('Accesso effettuato');
                onDone();
              })
            }
          >
            Verifica e accedi
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setCodeSent(false)}>
            Cambia email o reinvia
          </Button>
        </>
      )}

      {mode === 'password' && (
        <>
          <input
            className={inputCls}
            type="password"
            autoComplete="current-password"
            placeholder="Password (min. 6 caratteri)"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              size="lg"
              disabled={!validEmail || password.length < 6 || busy}
              onClick={() =>
                run(async () => {
                  const needsConfirm = await signUp(email.trim(), password);
                  if (needsConfirm) toast('Controlla la tua email per confermare');
                  else {
                    toast('Account creato');
                    onDone();
                  }
                })
              }
            >
              Registrati
            </Button>
            <Button
              size="lg"
              variant="primary"
              disabled={!validEmail || password.length < 6 || busy}
              onClick={() =>
                run(async () => {
                  await signInWithPassword(email.trim(), password);
                  toast('Accesso effettuato');
                  onDone();
                })
              }
            >
              Accedi
            </Button>
          </div>
        </>
      )}

      <p className="px-2 text-center text-[12px] leading-snug text-muted">
        Al primo accesso i dati già presenti su questo dispositivo vengono caricati nel tuo account, senza duplicati.
      </p>
    </div>
  );
}

function translate(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email o password non corretti';
  if (/token has expired|invalid/i.test(msg)) return 'Codice non valido o scaduto';
  if (/rate limit|security purposes/i.test(msg)) return 'Troppi tentativi, riprova tra poco';
  if (/already registered/i.test(msg)) return 'Email già registrata: usa Accedi';
  if (/failed to fetch|network/i.test(msg)) return 'Nessuna connessione';
  return msg;
}
