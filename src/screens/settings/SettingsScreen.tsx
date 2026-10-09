import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { IconDownload, IconTrash, IconUpload, IconVolume } from '../../components/Icons';
import { Button, ScreenHeader, Segmented, Toggle } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { db, requestPersistence } from '../../db';
import { createBackup, parseBackup, restoreBackup } from '../../lib/backup';
import { playRestDone, unlockAudio } from '../../lib/audio';
import { plansToCsv } from '../../lib/csv';
import { pickTextFile, saveFile, todayStamp } from '../../lib/files';
import { type ThemePref, updateSettings, useSettings } from '../../lib/settings';
import { fmtDateTime, isIOS, isStandalone } from '../../lib/utils';

const LAST_BACKUP_KEY = 'gympro.lastBackup';

function readLastBackup(): number | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function SettingsScreen() {
  const settings = useSettings();
  const { confirm, toast } = useFeedback();
  const counts = useLiveQuery(async () => ({ plans: await db.plans.count(), sessions: await db.sessions.count() }), []);
  const persisted = useLiveQuery(async () => (await navigator.storage?.persisted?.()) ?? false, []);
  const lastBackup = readLastBackup();

  const exportBackup = async () => {
    const data = await createBackup();
    await saveFile(`gympro-backup-${todayStamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
    try {
      localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    toast('Backup creato');
  };

  const importBackup = async () => {
    const f = await pickTextFile('.json,application/json');
    if (!f) return;
    try {
      const backup = parseBackup(f.text);
      const ok = await confirm({
        title: 'Ripristinare il backup?',
        message: `Il backup contiene ${backup.plans.length} schede e ${backup.sessions.length} sessioni. I dati attuali verranno SOSTITUITI.`,
        confirmLabel: 'Ripristina',
        danger: true,
      });
      if (!ok) return;
      await restoreBackup(backup);
      toast('Backup ripristinato');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const exportCsv = async () => {
    const plans = await db.plans.toArray();
    await saveFile(`gympro-schede-${todayStamp()}.csv`, '﻿' + plansToCsv(plans), 'text/csv;charset=utf-8');
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'Cancellare tutti i dati?',
      message: 'Schede e storico verranno eliminati definitivamente da questo dispositivo. Fai prima un backup!',
      confirmLabel: 'Cancella tutto',
      danger: true,
    });
    if (!ok) return;
    await db.transaction('rw', db.plans, db.sessions, async () => {
      await db.plans.clear();
      await db.sessions.clear();
    });
    toast('Dati cancellati');
  };

  return (
    <div className="space-y-6 px-4 pb-8">
      <div className="-mx-4">
        <ScreenHeader title="Impostazioni" />
      </div>

      {isIOS() && !isStandalone() && (
        <div className="rounded-3xl border border-accent/40 bg-accent-soft p-4 text-sm leading-relaxed">
          <p className="font-bold text-accent">Installa l’app</p>
          <p className="mt-1">
            In Safari tocca <b>Condividi</b> (il quadrato con la freccia) e poi <b>Aggiungi alla schermata Home</b>. Funzionerà a schermo intero e offline.
          </p>
        </div>
      )}

      <Section title="Aspetto">
        <Row label="Tema">
          <Segmented<ThemePref>
            className="w-full"
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'dark', label: 'Scuro' },
              { value: 'light', label: 'Chiaro' },
              { value: 'system', label: 'Sistema' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Allenamento">
        <Row label="Incremento peso (kg)">
          <Segmented
            className="w-full"
            value={String(settings.weightStep)}
            onChange={(v) => updateSettings({ weightStep: Number(v) })}
            options={['1', '1.25', '2.5', '5'].map((v) => ({ value: v, label: v.replace('.', ',') }))}
          />
        </Row>
        <InlineRow label="Suono fine recupero">
          <Toggle label="Suono fine recupero" checked={settings.sound} onChange={(sound) => updateSettings({ sound })} />
        </InlineRow>
        <InlineRow label="Beep ultimi 3 secondi">
          <Toggle label="Beep ultimi 3 secondi" checked={settings.countdownTicks} onChange={(countdownTicks) => updateSettings({ countdownTicks })} />
        </InlineRow>
        <Button
          className="w-full"
          onClick={() => {
            unlockAudio();
            playRestDone();
          }}
        >
          <IconVolume size={18} /> Prova suono
        </Button>
        <p className="px-1 text-xs leading-relaxed text-muted">
          Su iPhone la vibrazione non è supportata dal browser. Se non senti il suono, controlla che il tasto silenzioso non sia attivo e alza il volume.
        </p>
      </Section>

      <Section title="Dati e backup">
        <p className="px-1 text-sm leading-relaxed text-muted">
          I dati sono salvati <b className="text-fg">solo su questo dispositivo</b> ({counts?.plans ?? 0} schede, {counts?.sessions ?? 0} sessioni).
          Esporta un backup regolarmente e salvalo su File / iCloud.
          {lastBackup ? ` Ultimo backup: ${fmtDateTime(lastBackup)}.` : ' Nessun backup ancora.'}
        </p>
        <Button variant="primary" size="lg" className="w-full" onClick={exportBackup}>
          <IconDownload size={20} /> Esporta backup (JSON)
        </Button>
        <Button size="lg" className="w-full" onClick={importBackup}>
          <IconUpload size={20} /> Ripristina backup
        </Button>
        <Button className="w-full" onClick={exportCsv}>
          <IconDownload size={18} /> Esporta schede (CSV)
        </Button>
        {persisted === false && (
          <button
            type="button"
            className="w-full px-1 text-left text-xs text-muted underline"
            onClick={async () => toast((await requestPersistence()) ? 'Archiviazione persistente attiva' : 'Il browser non ha concesso la persistenza')}
          >
            Archiviazione non persistente: tocca per richiederla al browser
          </button>
        )}
      </Section>

      <Section title="Zona pericolosa">
        <Button variant="danger" className="w-full" onClick={wipe}>
          <IconTrash size={18} /> Cancella tutti i dati
        </Button>
      </Section>

      <p className="text-center text-xs text-muted">GymPro v{__APP_VERSION__} · offline-first · nessun dato lascia il dispositivo</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[15px] font-semibold">{label}</p>
      {children}
    </div>
  );
}

function InlineRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <p className="text-[15px] font-semibold">{label}</p>
      {children}
    </div>
  );
}
