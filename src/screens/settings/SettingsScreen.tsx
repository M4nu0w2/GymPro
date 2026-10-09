import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  IconCloud,
  IconCloudOff,
  IconDownload,
  IconFile,
  IconFlame,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconUser,
  IconVolume,
} from '../../components/Icons';
import { Group, Row, RowIcon, Screen, Segmented, Toggle } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { db, requestPersistence } from '../../db';
import { createBackup, parseBackup, restoreBackup, wipeTables } from '../../lib/backup';
import { playRestDone, unlockAudio } from '../../lib/audio';
import { plansToCsv } from '../../lib/csv';
import { pickTextFile, saveFile, todayStamp } from '../../lib/files';
import { type ThemePref, updateSettings, useSettings } from '../../lib/settings';
import { signOut, syncNow, useSync } from '../../lib/sync';
import { cn, fmtDateTime, isIOS, isStandalone, normalizeName } from '../../lib/utils';
import { AccountSheet } from './AccountSheet';

const LAST_BACKUP_KEY = 'gympro.lastBackup';

function readLastBackup(): number | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

const STEPS = ['1', '1.25', '2.5', '5'];

export function SettingsScreen() {
  const settings = useSettings();
  const sync = useSync();
  const { confirm, toast } = useFeedback();
  const [accountOpen, setAccountOpen] = useState(false);
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
        message: `Il backup contiene ${backup.plans.length} schede e ${backup.sessions.length} sessioni. I dati attuali verranno SOSTITUITI${sync.user ? ', anche nel cloud' : ''}.`,
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
    const [plans, metas] = await Promise.all([db.plans.toArray(), db.exercises.toArray()]);
    const m = new Map(metas.map((x) => [x.key, x.muscle]));
    await saveFile(`gympro-schede-${todayStamp()}.csv`, '﻿' + plansToCsv(plans, (n) => m.get(normalizeName(n))), 'text/csv;charset=utf-8');
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'Cancellare tutti i dati?',
      message: sync.user
        ? 'Schede, storico e misure verranno eliminati da questo dispositivo E dal tuo account cloud. Fai prima un backup!'
        : 'Schede, storico e misure verranno eliminati definitivamente da questo dispositivo. Fai prima un backup!',
      confirmLabel: 'Cancella tutto',
      danger: true,
    });
    if (!ok) return;
    await wipeTables();
    toast('Dati cancellati');
  };

  const logout = async () => {
    const ok = await confirm({
      title: 'Uscire dall’account?',
      message: 'I dati restano su questo dispositivo e nel cloud. Le nuove modifiche non verranno più sincronizzate finché non accedi di nuovo.',
      confirmLabel: 'Esci',
    });
    if (!ok) return;
    await signOut();
    toast('Disconnesso');
  };

  const syncLabel =
    sync.status === 'syncing'
      ? 'Sincronizzazione…'
      : sync.status === 'offline'
        ? 'Offline · sincronizzo al ritorno della rete'
        : sync.status === 'error'
          ? `Errore: ${sync.error ?? 'sconosciuto'}`
          : sync.lastSyncAt
            ? `Sincronizzato ${fmtDateTime(sync.lastSyncAt)}`
            : 'In attesa';

  return (
    <Screen title="Impostazioni">
      <div className="space-y-7 pt-2">
        {isIOS() && !isStandalone() && (
          <div className="mx-4 rounded-[22px] bg-accent-soft p-4 text-[15px] leading-snug">
            <p className="font-semibold text-accent">Installa l’app</p>
            <p className="mt-1">
              In Safari tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>. Funzionerà a schermo intero e offline.
            </p>
          </div>
        )}

        {/* Account */}
        {sync.configured ? (
          <Group
            header="Account e sincronizzazione"
            footer={sync.user ? syncLabel : 'Senza account i dati restano solo su questo dispositivo. Registrati per non perderli.'}
          >
            {sync.user ? (
              <>
                <Row
                  icon={
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-[19px] font-bold text-accent-ink uppercase">
                      {(sync.user.email ?? '?')[0]}
                    </span>
                  }
                  title={<span className="font-semibold">{sync.user.email ?? 'Account'}</span>}
                  subtitle={
                    <span className="flex items-center gap-1">
                      <span className={cn('h-2 w-2 rounded-full', sync.status === 'error' ? 'bg-danger' : sync.status === 'offline' ? 'bg-gold' : 'bg-accent')} />
                      {sync.status === 'offline' ? 'Offline' : sync.status === 'error' ? 'Errore di sincronizzazione' : 'Sincronizzazione attiva'}
                    </span>
                  }
                />
                <Row
                  icon={<RowIcon className="bg-[#0a84ff] text-white">{<IconRefresh size={17} className={sync.status === 'syncing' ? 'animate-spin' : ''} />}</RowIcon>}
                  title="Sincronizza ora"
                  chevron={false}
                  onClick={() => void syncNow()}
                />
                <Row icon={<RowIcon className="bg-[#8e8e93] text-white"><IconUser size={17} /></RowIcon>} title="Esci" destructive chevron={false} onClick={logout} />
              </>
            ) : (
              <Row
                icon={<RowIcon className="bg-[#0a84ff] text-white"><IconCloud size={18} /></RowIcon>}
                title={<span className="font-semibold">Accedi o registrati</span>}
                subtitle="Backup nel cloud e sync tra dispositivi"
                onClick={() => setAccountOpen(true)}
              />
            )}
          </Group>
        ) : (
          <Group header="Account e sincronizzazione" footer="Il cloud non è configurato in questa installazione: i dati restano sul dispositivo. Vedi README per attivare Supabase.">
            <Row icon={<RowIcon className="bg-[#8e8e93] text-white"><IconCloudOff size={17} /></RowIcon>} title="Solo locale" />
          </Group>
        )}

        <Group header="Aspetto">
          <div className="p-3">
            <Segmented<ThemePref>
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: 'system', label: 'Automatico' },
                { value: 'light', label: 'Chiaro' },
                { value: 'dark', label: 'Scuro' },
              ]}
            />
          </div>
        </Group>

        <Group header="Progressione" footer="Se nell’ultima sessione hai completato tutte le serie raggiungendo le rep target (il massimo del range), il peso viene precompilato con l’aumento. Puoi sempre modificarlo.">
          <Row
            icon={<RowIcon><IconSparkles size={17} /></RowIcon>}
            title="Proponi aumento"
            right={<Toggle label="Progressione automatica" checked={settings.progression} onChange={(progression) => updateSettings({ progression })} />}
          />
          {settings.progression && (
            <div className="px-4 pt-1 pb-3">
              <p className="mb-2 text-[15px] text-muted">Aumento proposto (kg)</p>
              <Segmented
                value={String(settings.progressionStep)}
                onChange={(v) => updateSettings({ progressionStep: Number(v) })}
                options={STEPS.map((v) => ({ value: v, label: v.replace('.', ',') }))}
              />
            </div>
          )}
        </Group>

        <Group header="Allenamento" footer="Su iPhone la vibrazione non è supportata dal browser. Se non senti il suono, controlla il tasto silenzioso e il volume.">
          <div className="px-4 pt-3 pb-3 shadow-[inset_0_-0.5px_0_var(--border)]">
            <p className="mb-2 text-[15px] text-muted">Passo dei pulsanti +/− peso (kg)</p>
            <Segmented
              value={String(settings.weightStep)}
              onChange={(v) => updateSettings({ weightStep: Number(v) })}
              options={STEPS.map((v) => ({ value: v, label: v.replace('.', ',') }))}
            />
          </div>
          <Row
            icon={<RowIcon className="bg-[#ff375f] text-white"><IconVolume size={17} /></RowIcon>}
            title="Suono fine recupero"
            right={<Toggle label="Suono fine recupero" checked={settings.sound} onChange={(sound) => updateSettings({ sound })} />}
          />
          <Row
            icon={<RowIcon className="bg-[#ff9f0a] text-white"><IconFlame size={17} /></RowIcon>}
            title="Beep ultimi 3 secondi"
            right={<Toggle label="Beep ultimi 3 secondi" checked={settings.countdownTicks} onChange={(countdownTicks) => updateSettings({ countdownTicks })} />}
          />
          <Row
            title={<span className="text-accent">Prova suono</span>}
            chevron={false}
            onClick={() => {
              unlockAudio();
              playRestDone();
            }}
          />
        </Group>

        <Group
          header="Dati e backup"
          footer={`${counts?.plans ?? 0} schede, ${counts?.sessions ?? 0} sessioni su questo dispositivo. ${
            lastBackup ? `Ultimo backup: ${fmtDateTime(lastBackup)}.` : 'Nessun backup JSON ancora.'
          }`}
        >
          <Row icon={<RowIcon className="bg-[#30d158] text-white"><IconDownload size={17} /></RowIcon>} title="Esporta backup (JSON)" onClick={exportBackup} />
          <Row icon={<RowIcon className="bg-[#0a84ff] text-white"><IconUpload size={17} /></RowIcon>} title="Ripristina backup" onClick={importBackup} />
          <Row icon={<RowIcon className="bg-[#8e8e93] text-white"><IconFile size={17} /></RowIcon>} title="Esporta schede (CSV)" onClick={exportCsv} />
          {persisted === false && (
            <Row
              title={<span className="text-[15px] text-muted">Archiviazione non persistente</span>}
              subtitle="Tocca per richiederla al browser"
              onClick={async () => toast((await requestPersistence()) ? 'Archiviazione persistente attiva' : 'Il browser non ha concesso la persistenza')}
            />
          )}
        </Group>

        <Group>
          <Row icon={<RowIcon className="bg-danger text-white"><IconTrash size={17} /></RowIcon>} title="Cancella tutti i dati" destructive chevron={false} onClick={wipe} />
        </Group>

        <p className="pb-2 text-center text-[13px] text-muted">GymPro v{__APP_VERSION__} · offline-first</p>
      </div>
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </Screen>
  );
}
