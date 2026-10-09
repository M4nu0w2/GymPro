import { Suspense, lazy, useMemo, useState } from 'react';
import { IconChart, IconChevronRight, IconPlay, IconTrophy } from '../../components/Icons';
import { Button, Card, EmptyState, ScreenHeader, Segmented } from '../../components/ui';
import { useDoneSessions } from '../../hooks/useData';
import { computeRecord, sessionVolume } from '../../lib/stats';
import { fmtDate, fmtDateTime, fmtDuration, fmtKg, fmtVolume } from '../../lib/utils';
import type { Session } from '../../types';
import { SessionDetail } from './SessionDetail';

// Recharts è pesante: caricato solo quando serve (resta comunque in cache offline)
const ExerciseDetail = lazy(() => import('./ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })));

type Tab = 'sessions' | 'exercises';

export function HistoryScreen({ active, onResume }: { active: Session | null; onResume: () => void }) {
  const sessions = useDoneSessions();
  const [tab, setTab] = useState<Tab>('sessions');
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [openExercise, setOpenExercise] = useState<string | null>(null);

  const exercises = useMemo(() => {
    const map = new Map<string, { key: string; name: string; sessions: number; last: number; sets: Session['sets'] }>();
    for (const s of sessions ?? []) {
      const seen = new Set<string>();
      for (const set of s.sets) {
        let e = map.get(set.exerciseKey);
        if (!e) {
          e = { key: set.exerciseKey, name: set.exerciseName, sessions: 0, last: s.startedAt, sets: [] };
          map.set(set.exerciseKey, e);
        }
        e.sets.push(set);
        if (!seen.has(set.exerciseKey)) {
          e.sessions++;
          seen.add(set.exerciseKey);
        }
      }
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  }, [sessions]);

  return (
    <div className="pb-6">
      <ScreenHeader title="Allenamento" subtitle="Storico e progressi" />

      {active && (
        <div className="px-4 pb-4">
          <Card className="anim-pulse border-accent/40 bg-accent-soft p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">In corso</p>
            <p className="mt-1 text-lg font-extrabold">{active.planName}</p>
            <p className="num text-sm text-muted">{active.sets.length} serie registrate</p>
            <Button variant="primary" size="lg" className="mt-3 w-full" onClick={onResume}>
              <IconPlay size={18} /> Riprendi allenamento
            </Button>
          </Card>
        </div>
      )}

      <div className="px-4 pb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sessions', label: 'Sessioni' },
            { value: 'exercises', label: 'Esercizi' },
          ]}
        />
      </div>

      {sessions?.length === 0 && (
        <EmptyState icon={<IconChart size={30} />} title="Ancora nessun allenamento" text="Completa il tuo primo allenamento da una scheda: qui vedrai storico e grafici." />
      )}

      {tab === 'sessions' && (
        <div className="space-y-2.5 px-4">
          {sessions?.map((s) => (
            <Card key={s.id} onClick={() => setOpenSession(s.id)} className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-surface-2">
                <span className="num text-lg leading-none font-black">{new Date(s.startedAt).getDate()}</span>
                <span className="text-[10px] font-bold uppercase text-muted">
                  {new Date(s.startedAt).toLocaleDateString('it-IT', { month: 'short' })}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{s.planName}</p>
                <p className="num truncate text-sm text-muted">
                  {fmtDuration((s.endedAt ?? s.startedAt) - s.startedAt)} · {s.sets.length} serie · {fmtVolume(sessionVolume(s))}
                </p>
                <p className="text-xs text-muted capitalize">{fmtDateTime(s.startedAt)}</p>
              </div>
              <IconChevronRight className="shrink-0 text-muted" />
            </Card>
          ))}
        </div>
      )}

      {tab === 'exercises' && (
        <div className="space-y-2.5 px-4">
          {exercises.map((e) => {
            const rec = computeRecord(e.sets);
            return (
              <Card key={e.key} onClick={() => setOpenExercise(e.key)} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{e.name}</p>
                  <p className="text-sm text-muted">
                    {e.sessions} {e.sessions === 1 ? 'sessione' : 'sessioni'} · ultima {fmtDate(e.last, { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                {rec.maxWeight > 0 && (
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-gold">
                    <IconTrophy size={14} />
                    <span className="num text-sm font-extrabold">{fmtKg(rec.maxWeight)}</span>
                  </div>
                )}
                <IconChevronRight className="shrink-0 text-muted" />
              </Card>
            );
          })}
        </div>
      )}

      <SessionDetail sessionId={openSession} onClose={() => setOpenSession(null)} onOpenExercise={(k) => setOpenExercise(k)} />
      {openExercise && (
        <Suspense fallback={null}>
          <ExerciseDetail exerciseKey={openExercise} onClose={() => setOpenExercise(null)} onOpenSession={(id) => setOpenSession(id)} />
        </Suspense>
      )}
    </div>
  );
}
