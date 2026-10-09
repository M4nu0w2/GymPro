import { useMemo, useState } from 'react';
import type { Tab } from '../../App';
import { WeekStrip } from '../../components/Calendar';
import {
  IconCloud,
  IconFlame,
  IconList,
  IconPlay,
  IconPlus,
  IconTrophy,
  IconX,
} from '../../components/Icons';
import { Button, Card, Row, Screen, SectionTitle, Sheet } from '../../components/ui';
import { useDoneSessions, usePlans } from '../../hooks/useData';
import { useNow } from '../../hooks/useNow';
import { MUSCLE_LABEL, useMuscleMap } from '../../lib/exercises';
import { suggestNextPlan } from '../../lib/plans';
import { addDays, dayStreak, prTimeline, sessionVolume, startOfWeek, trainingDays, weekStreak } from '../../lib/stats';
import { useSync } from '../../lib/sync';
import { cn, fmtClock, fmtDate, fmtKg, fmtVolume, normalizeName } from '../../lib/utils';
import type { Plan, Session } from '../../types';

const INVITE_KEY = 'gympro.inviteDismissed';

export function HomeScreen({
  active,
  onStart,
  onResume,
  onGo,
}: {
  active: Session | null;
  onStart: (p: Plan) => void;
  onResume: () => void;
  onGo: (t: Tab) => void;
}) {
  const plans = usePlans();
  const sessions = useDoneSessions();
  const muscles = useMuscleMap();
  const sync = useSync();
  const [pickOpen, setPickOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [inviteDismissed, setInviteDismissed] = useState(() => {
    try {
      return localStorage.getItem(INVITE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const suggested = useMemo(() => (plans && sessions ? suggestNextPlan(plans, sessions) : null), [plans, sessions]);
  const next = (chosen && plans?.find((p) => p.id === chosen)) || suggested;

  const stats = useMemo(() => {
    const list = sessions ?? [];
    const days = trainingDays(list);
    const week = startOfWeek(Date.now());
    const prevWeek = addDays(week, -7);
    let vol = 0;
    let prevVol = 0;
    let sets = 0;
    let count = 0;
    for (const s of list) {
      if (s.startedAt >= week) {
        vol += sessionVolume(s);
        sets += s.sets.length;
        count++;
      } else if (s.startedAt >= prevWeek) prevVol += sessionVolume(s);
    }
    const prs = [...prTimeline(list).entries()]
      .flatMap(([id, hits]) => hits.map((h) => ({ ...h, sessionId: id })))
      .sort((a, b) => b.set.timestamp - a.set.timestamp)
      .slice(0, 3);
    return { days, weeks: weekStreak(list), dayStreak: dayStreak(days), vol, prevVol, sets, count, prs };
  }, [sessions]);

  const lastDone = (planId: string) => sessions?.find((s) => s.planId === planId)?.startedAt;
  const showInvite = sync.configured && sync.ready && !sync.user && !inviteDismissed;
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen title="Oggi" subtitle={today}>
      <div className="space-y-4 px-4 pt-2">
        {/* Card principale */}
        {active ? (
          <ResumeCard session={active} onResume={onResume} />
        ) : next ? (
          <Card className="relative overflow-hidden p-5">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-accent opacity-[0.16] blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold tracking-wide text-accent uppercase">Prossimo allenamento</p>
                {(plans?.length ?? 0) > 1 && (
                  <button type="button" onClick={() => setPickOpen(true)} className="tap -mr-1 rounded-full px-2 py-1 text-[15px] font-semibold text-accent">
                    Cambia
                  </button>
                )}
              </div>
              <h2 className="mt-1 text-[28px] leading-tight font-bold">{next.name}</h2>
              <p className="mt-0.5 text-[15px] text-muted">
                {next.exercises.length} esercizi
                {lastDone(next.id) ? ` · ultima volta ${fmtDate(lastDone(next.id)!, { day: 'numeric', month: 'short' })}` : ' · mai fatta'}
              </p>
              <MuscleChips plan={next} muscles={muscles} />
              <Button variant="primary" size="xl" className="mt-5 w-full font-bold" onClick={() => onStart(next)}>
                <IconPlay size={20} /> Inizia
              </Button>
            </div>
          </Card>
        ) : plans ? (
          <Card className="p-5 text-center">
            <h2 className="text-[22px] font-bold">Crea la tua prima scheda</h2>
            <p className="mt-1 text-[15px] text-muted">Aggiungi gli esercizi o importali da un file CSV o da un link condiviso.</p>
            <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => onGo('plans')}>
              <IconPlus size={20} /> Nuova scheda
            </Button>
          </Card>
        ) : null}

        {showInvite && (
          <Card className="flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <IconCloud size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Non perdere i tuoi dati</p>
              <p className="text-[13px] leading-snug text-muted">Crea un account gratuito: schede e storico al sicuro nel cloud e su tutti i tuoi dispositivi.</p>
              <Button size="sm" variant="tinted" className="mt-2.5" onClick={() => onGo('settings')}>
                Accedi o registrati
              </Button>
            </div>
            <button
              type="button"
              aria-label="Non ora"
              className="tap -mt-1 -mr-1 p-1 text-faint"
              onClick={() => {
                setInviteDismissed(true);
                try {
                  localStorage.setItem(INVITE_KEY, '1');
                } catch {
                  /* ignore */
                }
              }}
            >
              <IconX size={18} />
            </button>
          </Card>
        )}

        {/* Streak + settimana */}
        <Card className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className={cn('flex h-11 w-11 items-center justify-center rounded-full', stats.weeks > 0 ? 'bg-gold-soft text-gold' : 'bg-surface-2 text-muted')}>
              <IconFlame size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="rounded-num text-[22px] leading-tight font-bold">
                {stats.weeks} {stats.weeks === 1 ? 'settimana' : 'settimane'}
              </p>
              <p className="text-[13px] text-muted">
                di fila · {stats.dayStreak > 1 ? `${stats.dayStreak} giorni consecutivi · ` : ''}
                {stats.count} {stats.count === 1 ? 'allenamento' : 'allenamenti'} questa settimana
              </p>
            </div>
          </div>
          <WeekStrip days={stats.days} />
        </Card>

        {/* Volume settimanale */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-[13px] text-muted">Volume settimana</p>
            <p className="rounded-num mt-1 text-[26px] leading-none font-bold">{fmtVolume(stats.vol)}</p>
            <Trend now={stats.vol} prev={stats.prevVol} />
          </Card>
          <Card className="p-4">
            <p className="text-[13px] text-muted">Serie settimana</p>
            <p className="rounded-num mt-1 text-[26px] leading-none font-bold">{stats.sets}</p>
            <p className="mt-1.5 text-[13px] text-muted">
              {stats.count} {stats.count === 1 ? 'sessione' : 'sessioni'}
            </p>
          </Card>
        </div>
      </div>

      {/* Record recenti */}
      {stats.prs.length > 0 && (
        <>
          <SectionTitle
            action={
              <button type="button" className="tap text-[15px] text-accent" onClick={() => onGo('progress')}>
                Tutti
              </button>
            }
          >
            Ultimi record
          </SectionTitle>
          <div className="mx-4 overflow-hidden rounded-[22px] bg-surface">
            {stats.prs.map((pr) => (
              <Row
                key={pr.sessionId + pr.exerciseName}
                icon={
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-gold text-white">
                    <IconTrophy size={17} />
                  </span>
                }
                title={pr.exerciseName}
                subtitle={fmtDate(pr.set.timestamp, { day: 'numeric', month: 'short' })}
                value={pr.kind === 'peso' ? `${fmtKg(pr.value)} kg × ${pr.set.reps}` : `1RM ${fmtKg(Math.round(pr.value * 10) / 10)} kg`}
              />
            ))}
          </div>
        </>
      )}

      {/* Accesso rapido */}
      {(plans?.length ?? 0) > 0 && (
        <>
          <SectionTitle
            action={
              <button type="button" className="tap text-[15px] text-accent" onClick={() => onGo('plans')}>
                Tutte
              </button>
            }
          >
            Le tue schede
          </SectionTitle>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
            {plans!.map((p) => (
              <Card key={p.id} className="flex w-[200px] shrink-0 snap-start flex-col p-4">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <IconList size={18} />
                </span>
                <p className="truncate text-[17px] font-semibold">{p.name}</p>
                <p className="text-[13px] text-muted">{p.exercises.length} esercizi</p>
                <Button
                  size="sm"
                  variant="tinted"
                  className="mt-3 self-start"
                  disabled={p.exercises.length === 0}
                  onClick={() => (active?.planId === p.id ? onResume() : onStart(p))}
                >
                  <IconPlay size={13} /> {active?.planId === p.id ? 'Riprendi' : 'Inizia'}
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Scegli la scheda">
        <div className="overflow-hidden rounded-[22px] bg-surface">
          {plans?.map((p) => (
            <Row
              key={p.id}
              title={p.name}
              subtitle={`${p.exercises.length} esercizi${lastDone(p.id) ? ` · ${fmtDate(lastDone(p.id)!, { day: 'numeric', month: 'short' })}` : ''}`}
              right={p.id === next?.id ? <span className="text-[15px] font-semibold text-accent">Suggerita</span> : undefined}
              onClick={() => {
                setChosen(p.id);
                setPickOpen(false);
              }}
            />
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}

function ResumeCard({ session, onResume }: { session: Session; onResume: () => void }) {
  const now = useNow(1000);
  const target = session.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets), 0);
  const done = session.sets.length;
  return (
    <Card className="relative overflow-hidden bg-accent p-5 text-accent-ink">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold tracking-wide uppercase opacity-80">Allenamento in corso</p>
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
      </div>
      <h2 className="mt-1 text-[28px] leading-tight font-bold">{session.planName}</h2>
      <div className="mt-2 flex items-end justify-between">
        <p className="rounded-num text-[44px] leading-none font-bold">{fmtClock((now - session.startedAt) / 1000)}</p>
        <p className="num pb-1 text-[15px] font-semibold opacity-80">
          {done}/{target} serie
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/15">
        <div className="h-full rounded-full bg-current transition-[width] duration-500" style={{ width: `${(done / Math.max(1, target)) * 100}%` }} />
      </div>
      <button type="button" onClick={onResume} className="tap mt-5 flex h-[60px] w-full items-center justify-center gap-2 rounded-full bg-black/85 text-[19px] font-bold text-white dark:bg-black/80">
        <IconPlay size={20} /> Riprendi allenamento
      </button>
    </Card>
  );
}

function MuscleChips({ plan, muscles }: { plan: Plan; muscles: Map<string, string> | undefined }) {
  const list = [...new Set(plan.exercises.map((e) => muscles?.get(normalizeName(e.name))).filter(Boolean))] as (keyof typeof MUSCLE_LABEL)[];
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {list.map((m) => (
        <span key={m} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-fg-2">
          {MUSCLE_LABEL[m]}
        </span>
      ))}
    </div>
  );
}

function Trend({ now, prev }: { now: number; prev: number }) {
  if (prev <= 0) return <p className="mt-1.5 text-[13px] text-muted">dal lunedì</p>;
  const pct = Math.round(((now - prev) / prev) * 100);
  return (
    <p className={cn('num mt-1.5 flex items-center gap-0.5 text-[13px] font-semibold', pct >= 0 ? 'text-accent' : 'text-muted')}>
      {pct >= 0 ? '↑' : '↓'} {Math.abs(pct)}% <span className="font-normal text-muted">vs scorsa</span>
    </p>
  );
}
