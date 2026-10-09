import { Suspense, lazy, useMemo, useState } from 'react';
import { MonthCalendar } from '../../components/Calendar';
import { IconCalendar, IconChart, IconChevronLeft, IconChevronRight, IconFlame, IconTrophy } from '../../components/Icons';
import { Card, EmptyState, Group, IconButton, Row, Screen, Segmented } from '../../components/ui';
import { useDoneSessions } from '../../hooks/useData';
import { MUSCLE_LABEL, UNASSIGNED_LABEL, useMuscleMap } from '../../lib/exercises';
import {
  addDays,
  computeRecord,
  dayKey,
  dayStreak,
  prTimeline,
  sessionVolume,
  startOfWeek,
  trainingDays,
  weekStreak,
  weeklyVolumeByMuscle,
} from '../../lib/stats';
import { cn, fmtDate, fmtDuration, fmtKg, fmtVolume } from '../../lib/utils';
import type { Session } from '../../types';
import { BodyPanel } from './BodyPanel';
import { SessionDetail } from './SessionDetail';

// Recharts è pesante: caricato solo quando serve (resta comunque in cache offline)
const ExerciseDetail = lazy(() => import('./ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })));

type Tab = 'sessions' | 'exercises' | 'stats' | 'body';

export function ProgressScreen() {
  const sessions = useDoneSessions();
  const [tab, setTab] = useState<Tab>('sessions');
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const prs = useMemo(() => prTimeline(sessions ?? []), [sessions]);

  return (
    <Screen title="Progressi">
      <div className="px-4 pt-1 pb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sessions', label: 'Sessioni' },
            { value: 'exercises', label: 'Esercizi' },
            { value: 'stats', label: 'Statistiche' },
            { value: 'body', label: 'Corpo' },
          ]}
        />
      </div>

      <div key={tab} className="anim-screen">
        {tab !== 'body' && sessions?.length === 0 && (
          <EmptyState icon={<IconChart size={30} />} title="Ancora nessun allenamento" text="Completa il primo allenamento: qui vedrai storico, record e grafici." />
        )}
        {tab === 'sessions' && sessions && <SessionList sessions={sessions} prs={prs} onOpen={setOpenSession} />}
        {tab === 'exercises' && sessions && <ExerciseList sessions={sessions} onOpen={setOpenExercise} />}
        {tab === 'stats' && sessions && sessions.length > 0 && <StatsPanel sessions={sessions} prs={prs} onOpenSession={setOpenSession} />}
        {tab === 'body' && <BodyPanel />}
      </div>

      <SessionDetail
        sessionId={openSession}
        prs={openSession ? prs.get(openSession) : undefined}
        onClose={() => setOpenSession(null)}
        onOpenExercise={(k) => setOpenExercise(k)}
      />
      {openExercise && (
        <Suspense fallback={null}>
          <ExerciseDetail exerciseKey={openExercise} onClose={() => setOpenExercise(null)} onOpenSession={(id) => setOpenSession(id)} />
        </Suspense>
      )}
    </Screen>
  );
}

function SessionList({ sessions, prs, onOpen }: { sessions: Session[]; prs: Map<string, unknown[]>; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) {
      const k = new Date(s.startedAt).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [sessions]);

  return (
    <div className="space-y-6">
      {groups.map(([month, list]) => (
        <Group key={month} header={month}>
          {list.map((s) => {
            const nPr = prs.get(s.id)?.length ?? 0;
            return (
              <Row
                key={s.id}
                onClick={() => onOpen(s.id)}
                icon={
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[12px] bg-surface-2">
                    <span className="text-[10px] leading-none font-semibold text-danger uppercase">
                      {new Date(s.startedAt).toLocaleDateString('it-IT', { weekday: 'short' })}
                    </span>
                    <span className="num text-[19px] leading-tight font-semibold">{new Date(s.startedAt).getDate()}</span>
                  </span>
                }
                title={
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{s.planName}</span>
                    {nPr > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-gold">
                        <IconTrophy size={11} /> {nPr > 1 ? nPr : 'PR'}
                      </span>
                    )}
                  </span>
                }
                subtitle={`${fmtDuration((s.endedAt ?? s.startedAt) - s.startedAt)} · ${s.sets.length} serie · ${fmtVolume(sessionVolume(s))}`}
              />
            );
          })}
        </Group>
      ))}
    </div>
  );
}

function ExerciseList({ sessions, onOpen }: { sessions: Session[]; onOpen: (key: string) => void }) {
  const muscles = useMuscleMap();
  const exercises = useMemo(() => {
    const map = new Map<string, { key: string; name: string; sessions: number; last: number; sets: Session['sets'] }>();
    for (const s of sessions) {
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

  if (!exercises.length) return null;
  return (
    <Group>
      {exercises.map((e) => {
        const rec = computeRecord(e.sets);
        const m = muscles?.get(e.key);
        return (
          <Row
            key={e.key}
            onClick={() => onOpen(e.key)}
            title={e.name}
            subtitle={`${m ? MUSCLE_LABEL[m] + ' · ' : ''}${e.sessions} ${e.sessions === 1 ? 'sessione' : 'sessioni'} · ${fmtDate(e.last, { day: 'numeric', month: 'short' })}`}
            right={
              <span className="flex shrink-0 items-center gap-2">
                {rec.maxWeight > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-gold">
                    <IconTrophy size={13} />
                    <span className="num text-[13px] font-bold">{fmtKg(rec.maxWeight)}</span>
                  </span>
                )}
                <IconChevronRight size={18} strokeWidth={2.4} className="text-faint" />
              </span>
            }
          />
        );
      })}
    </Group>
  );
}

function StatsPanel({
  sessions,
  prs,
  onOpenSession,
}: {
  sessions: Session[];
  prs: ReturnType<typeof prTimeline>;
  onOpenSession: (id: string) => void;
}) {
  const muscles = useMuscleMap();
  const [week, setWeek] = useState(() => startOfWeek(Date.now()));
  const days = useMemo(() => trainingDays(sessions), [sessions]);
  const volume = useMemo(() => weeklyVolumeByMuscle(sessions, week, (k) => muscles?.get(k)), [sessions, week, muscles]);
  const maxVol = Math.max(1, ...volume.map((v) => v.volume));
  const totalVol = volume.reduce((a, v) => a + v.volume, 0);
  const allPrs = useMemo(
    () =>
      [...prs.entries()]
        .flatMap(([id, hits]) => hits.map((h) => ({ ...h, sessionId: id })))
        .sort((a, b) => b.set.timestamp - a.set.timestamp)
        .slice(0, 20),
    [prs],
  );
  const thisWeek = startOfWeek(Date.now());
  const weekLabel =
    week === thisWeek
      ? 'Questa settimana'
      : week === addDays(thisWeek, -7)
        ? 'Settimana scorsa'
        : `${fmtDate(week, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(week, 6), { day: 'numeric', month: 'short' })}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2.5 px-4">
        <Tile icon={<IconFlame size={18} />} value={weekStreak(sessions)} label="settimane di fila" gold />
        <Tile icon={<IconCalendar size={18} />} value={dayStreak(days)} label="giorni di fila" />
        <Tile icon={<IconChart size={18} />} value={sessions.length} label="allenamenti" />
      </div>

      <div className="px-4">
        <Card className="p-4">
          <MonthCalendar
            days={days}
            onSelectDay={(k) => {
              const s = sessions.find((x) => dayKey(x.startedAt) === k);
              if (s) onOpenSession(s.id);
            }}
          />
        </Card>
      </div>

      <section className="px-4">
        <h2 className="mb-1.5 px-4 text-[13px] text-muted uppercase">Volume per muscolo</h2>
        <Card className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold">{weekLabel}</p>
              <p className="num text-[13px] text-muted">{fmtVolume(totalVol)} totali · peso × rep</p>
            </div>
            <IconButton label="Settimana precedente" onClick={() => setWeek(addDays(week, -7))}>
              <IconChevronLeft size={18} strokeWidth={2.6} />
            </IconButton>
            <IconButton label="Settimana successiva" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}>
              <IconChevronRight size={18} strokeWidth={2.6} />
            </IconButton>
          </div>
          {volume.length === 0 ? (
            <p className="py-6 text-center text-[15px] text-muted">Nessun allenamento in questa settimana.</p>
          ) : (
            <ul className="space-y-3" aria-label="Volume per gruppo muscolare">
              {volume.map((v) => (
                <li key={v.muscle ?? 'none'}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[15px]">
                    <span className={cn('font-semibold', !v.muscle && 'text-muted')}>{v.muscle ? MUSCLE_LABEL[v.muscle] : UNASSIGNED_LABEL}</span>
                    <span className="num text-[13px] text-muted">
                      {fmtVolume(v.volume)} · {v.sets} serie
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn('h-full rounded-full transition-[width] duration-700 ease-[var(--ease-ios)]', v.muscle ? 'bg-accent' : 'bg-faint')}
                      style={{ width: `${Math.max(3, (v.volume / maxVol) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {volume.some((v) => !v.muscle) && (
            <p className="mt-4 text-[13px] leading-snug text-muted">
              Gli esercizi senza gruppo muscolare finiscono in “{UNASSIGNED_LABEL}”. Puoi assegnarlo dalla scheda dell'esercizio o durante l'allenamento.
            </p>
          )}
        </Card>
      </section>

      {allPrs.length > 0 && (
        <Group header="Record personali">
          {allPrs.map((pr) => (
            <Row
              key={pr.sessionId + pr.exerciseName + pr.kind}
              onClick={() => onOpenSession(pr.sessionId)}
              icon={
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-gold text-white">
                  <IconTrophy size={17} />
                </span>
              }
              title={pr.exerciseName}
              subtitle={`${fmtDate(pr.set.timestamp, { day: 'numeric', month: 'short', year: 'numeric' })} · prima ${fmtKg(Math.round(pr.previous * 10) / 10)} kg`}
              value={pr.kind === 'peso' ? `${fmtKg(pr.value)} kg` : `1RM ${fmtKg(Math.round(pr.value * 10) / 10)}`}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

function Tile({ icon, value, label, gold }: { icon: React.ReactNode; value: number; label: string; gold?: boolean }) {
  return (
    <Card className="p-3.5">
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', gold ? 'bg-gold-soft text-gold' : 'bg-accent-soft text-accent')}>{icon}</span>
      <p className="rounded-num mt-2 text-[28px] leading-none font-bold">{value}</p>
      <p className="mt-1 text-[12px] leading-tight text-muted">{label}</p>
    </Card>
  );
}
