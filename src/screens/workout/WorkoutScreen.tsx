import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFlag,
  IconMinimize,
  IconPlus,
  IconSkip,
} from '../../components/Icons';
import { RestTimer } from '../../components/RestTimer';
import { SetEditSheet } from '../../components/SetEditSheet';
import { Stepper } from '../../components/Stepper';
import { Button, IconButton, Sheet } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { useNow } from '../../hooks/useNow';
import { useWakeLock } from '../../hooks/useWakeLock';
import { unlockAudio } from '../../lib/audio';
import { useSettings } from '../../lib/settings';
import {
  addSetToSession,
  computePrefill,
  deleteSetFromSession,
  discardWorkout,
  finishWorkout,
  patchSession,
  previousSessionsFor,
  updateSetInSession,
} from '../../lib/workout';
import { cn, fmtClock, fmtKg, fmtRest } from '../../lib/utils';
import type { Session, SessionExercise, SetLog } from '../../types';

interface Props {
  session: Session;
  onMinimize: () => void;
  onFinished: (sessionId: string | null) => void;
}

export function WorkoutScreen({ session, onMinimize, onFinished }: Props) {
  const ui = session.ui ?? { exIndex: 0, restEndsAt: null, restTotalSec: 0 };
  const exIndex = Math.min(ui.exIndex, session.exercises.length - 1);
  const ex = session.exercises[exIndex];
  const [restExpanded, setRestExpanded] = useState(() => ui.restEndsAt != null && ui.restEndsAt > Date.now());
  const [editing, setEditing] = useState<SetLog | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [flash, setFlash] = useState(0);
  const { confirm, toast } = useFeedback();
  const { weightStep } = useSettings();
  const now = useNow(1000);

  useWakeLock(true);

  const setsFor = (key: string) => session.sets.filter((s) => s.exerciseKey === key).sort((a, b) => a.setNumber - b.setNumber);
  const currentSets = setsFor(ex.key);
  const nextSetNumber = currentSets.length + 1;
  const exDone = currentSets.length >= ex.sets;

  // Ultima sessione conclusa con questo esercizio (null = mai fatto)
  const lastSession = useLiveQuery(
    async () => (await previousSessionsFor(ex.key, session.id))[0] ?? null,
    [ex.key, session.id],
  );

  const prefill = useMemo(
    () => (lastSession === undefined ? null : computePrefill(nextSetNumber, lastSession ?? undefined, ex.key, session.sets, ex.reps)),
    [lastSession, nextSetNumber, ex.key, ex.reps, session.sets],
  );

  const setUi = (patch: Partial<NonNullable<Session['ui']>>) =>
    patchSession(session.id, (s) => ({ ...s, ui: { ...(s.ui ?? ui), ...patch } }));

  const goTo = (i: number) => {
    if (i < 0 || i >= session.exercises.length) return;
    void setUi({ exIndex: i });
  };

  const totalTarget = session.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets), 0);
  const totalDone = session.sets.length;

  const nextUnfinished = (from: number, sets: SetLog[]): number | null => {
    const n = session.exercises.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      const e = session.exercises[i];
      if (e.skipped) continue;
      if (sets.filter((s) => s.exerciseKey === e.key).length < e.sets) return i;
    }
    return null;
  };

  const completeSet = async (weight: number | null, reps: number | null) => {
    unlockAudio();
    if (reps == null || reps <= 0) {
      toast('Inserisci le ripetizioni', 'error');
      return;
    }
    await addSetToSession(session.id, { exerciseName: ex.name, setNumber: nextSetNumber, weight: weight ?? 0, reps });
    const simulated = [...session.sets, { exerciseKey: ex.key } as SetLog];
    const finishedThis = nextSetNumber >= ex.sets;
    const next = finishedThis ? nextUnfinished(exIndex, simulated) : exIndex;
    if (finishedThis && next == null) {
      // ultimo set dell'allenamento: niente recupero
      await setUi({ restEndsAt: null });
      toast('Tutte le serie completate! 💪');
      setFinishOpen(true);
      return;
    }
    const restSec = ex.restSec;
    await setUi({
      exIndex: next ?? exIndex,
      restEndsAt: restSec > 0 ? Date.now() + restSec * 1000 : null,
      restTotalSec: restSec,
    });
    if (restSec > 0) setRestExpanded(true);
  };

  const addExtraSet = () =>
    patchSession(session.id, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i === exIndex ? { ...e, sets: e.sets + 1, skipped: false } : e)),
    }));

  const skipExercise = async () => {
    const remaining = ex.sets - currentSets.length;
    if (remaining > 0 && !(await confirm({ title: 'Saltare esercizio?', message: `${ex.name}: ${remaining} serie non eseguite.`, confirmLabel: 'Salta' })))
      return;
    await patchSession(session.id, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i === exIndex ? { ...e, skipped: true } : e)),
    }));
    const next = nextUnfinished(exIndex, session.sets);
    if (next != null) goTo(next);
  };

  const adjustRest = (delta: number) => {
    if (ui.restEndsAt == null) return;
    const endsAt = Math.max(Date.now() + 1000, ui.restEndsAt + delta * 1000);
    void setUi({ restEndsAt: endsAt, restTotalSec: Math.max(ui.restTotalSec + delta, 1) });
  };

  const restDone = () => {
    setFlash(Date.now());
    setRestExpanded(false);
    void setUi({ restEndsAt: null });
  };

  const finish = async () => {
    setFinishOpen(false);
    if (session.sets.length === 0) {
      await discardWorkout(session.id);
      onFinished(null);
      return;
    }
    await finishWorkout(session.id);
    onFinished(session.id);
  };

  const discard = async () => {
    const ok = await confirm({
      title: 'Scartare l’allenamento?',
      message: 'Tutte le serie registrate in questa sessione verranno eliminate.',
      confirmLabel: 'Scarta',
      danger: true,
    });
    if (!ok) return;
    setFinishOpen(false);
    await discardWorkout(session.id);
    onFinished(null);
  };

  const lastTimeText = useMemo(() => {
    if (!lastSession) return null;
    const sets = lastSession.sets.filter((s) => s.exerciseKey === ex.key).sort((a, b) => a.setNumber - b.setNumber);
    if (!sets.length) return null;
    return sets.map((s) => `${fmtKg(s.weight)}kg × ${s.reps}`).join(', ');
  }, [lastSession, ex.key]);

  const restRunning = ui.restEndsAt != null && ui.restEndsAt > now - 1000;
  const nextExForRest = session.exercises[exIndex];

  return (
    <div className="anim-sheet fixed inset-0 z-30 flex flex-col bg-bg px-safe">
      {/* Header */}
      <header className="pt-safe border-b border-line bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-2 px-2 py-2">
          <IconButton label="Riduci allenamento" onClick={onMinimize}>
            <IconMinimize />
          </IconButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[15px] font-bold">{session.planName}</p>
            <p className="num text-xs font-medium text-muted">
              {fmtClock((now - session.startedAt) / 1000)} · {totalDone}/{totalTarget} serie
            </p>
          </div>
          <Button size="sm" variant="primary" onClick={() => setFinishOpen(true)}>
            <IconFlag size={16} /> Fine
          </Button>
        </div>
        <div className="h-1 bg-surface-2">
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${(totalDone / Math.max(1, totalTarget)) * 100}%` }} />
        </div>
      </header>

      {/* Lista esercizi */}
      <ExerciseStrip exercises={session.exercises} sets={session.sets} current={exIndex} onSelect={goTo} />

      <div className="scroll-area min-h-0 flex-1 px-4 pb-6">
        <div key={exIndex} className="anim-pop">
          <div className="flex items-center gap-2 pt-1">
            <IconButton label="Esercizio precedente" disabled={exIndex === 0} onClick={() => goTo(exIndex - 1)} className="bg-surface-2">
              <IconChevronLeft />
            </IconButton>
            <div className="min-w-0 flex-1 text-center">
              <p className="num text-[11px] font-bold uppercase tracking-[0.16em] text-muted [@media(max-height:700px)]:hidden">
                Esercizio {exIndex + 1} di {session.exercises.length}
              </p>
              <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance">{ex.name}</h1>
              <p className="num text-sm text-muted">
                {ex.sets} × {ex.reps} rep · rec. {fmtRest(ex.restSec)}
              </p>
            </div>
            <IconButton
              label="Esercizio successivo"
              disabled={exIndex === session.exercises.length - 1}
              onClick={() => goTo(exIndex + 1)}
              className="bg-surface-2"
            >
              <IconChevronRight />
            </IconButton>
          </div>
          {ex.notes && <p className="mx-auto mt-2 max-w-sm rounded-xl bg-surface-2 px-3 py-1.5 text-center text-sm text-muted">{ex.notes}</p>}

          {ex.skipped && (
            <p className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-center text-sm font-semibold text-gold">Esercizio saltato</p>
          )}

          {/* Serie corrente */}
          <div className="mt-3 rounded-[28px] border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[22px] font-extrabold">
                {exDone ? (
                  <span className="text-accent">Completato ✓</span>
                ) : (
                  <>
                    Serie <span className="num text-accent">{nextSetNumber}</span>
                    <span className="text-muted"> di </span>
                    <span className="num">{ex.sets}</span>
                  </>
                )}
              </p>
              {exDone && (
                <Button size="sm" onClick={addExtraSet}>
                  <IconPlus size={16} /> Serie extra
                </Button>
              )}
            </div>

            {lastTimeText ? (
              <p className="mt-1 text-[13px] leading-snug text-muted">
                <span className="font-semibold">Ultima volta:</span> <span className="num">{lastTimeText}</span>
              </p>
            ) : lastSession === null ? (
              <p className="mt-1 text-[13px] text-muted">Prima volta con questo esercizio</p>
            ) : null}

            {!exDone && prefill && (
              <SetEntry
                key={`${exIndex}-${nextSetNumber}`}
                initialWeight={prefill.weight}
                initialReps={prefill.reps}
                weightStep={weightStep}
                onComplete={completeSet}
              />
            )}
          </div>

          {/* Serie già fatte */}
          {currentSets.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">Serie registrate · tocca per modificare</p>
              <div className="space-y-2">
                {currentSets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setEditing(s)}
                    className="tap flex h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 text-left active:bg-surface-2"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <IconCheck size={16} strokeWidth={3} />
                    </span>
                    <span className="text-sm font-semibold text-muted">Serie {s.setNumber}</span>
                    <span className="num ml-auto text-lg font-extrabold">
                      {fmtKg(s.weight)}
                      <span className="text-sm font-semibold text-muted"> kg</span> × {s.reps}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            {!exDone && (
              <Button onClick={addExtraSet}>
                <IconPlus size={18} /> Serie extra
              </Button>
            )}
            {!ex.skipped && !exDone && (
              <Button onClick={skipExercise}>
                <IconSkip size={18} /> Salta esercizio
              </Button>
            )}
            {exDone && exIndex < session.exercises.length - 1 && (
              <Button variant="primary" className="col-span-2" size="lg" onClick={() => goTo(exIndex + 1)}>
                Prossimo esercizio <IconChevronRight size={20} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Barra recupero compatta */}
      {restRunning && ui.restEndsAt != null && (
        <div className={restExpanded ? '' : 'border-t border-line px-4 pt-3 pb-[max(12px,var(--safe-bottom))]'}>
          <RestTimer
            endsAt={ui.restEndsAt}
            totalSec={ui.restTotalSec}
            nextLabel={nextExForRest ? `${nextExForRest.name} · serie ${Math.min(setsFor(nextExForRest.key).length + 1, nextExForRest.sets)}` : undefined}
            expanded={restExpanded}
            onExpand={setRestExpanded}
            onAdjust={adjustRest}
            onSkip={() => {
              setRestExpanded(false);
              void setUi({ restEndsAt: null });
            }}
            onDone={restDone}
          />
        </div>
      )}

      {flash > 0 && (
        <div key={flash} className="anim-flash pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent">
          <p className="text-4xl font-black text-accent-ink">VIA! 🔥</p>
        </div>
      )}

      <SetEditSheet
        set={editing}
        onClose={() => setEditing(null)}
        onSave={async (p) => {
          if (editing) await updateSetInSession(session.id, editing.id, p);
          setEditing(null);
          toast('Serie aggiornata');
        }}
        onDelete={async () => {
          if (editing) await deleteSetFromSession(session.id, editing.id);
          setEditing(null);
          toast('Serie eliminata');
        }}
      />

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Termina allenamento">
        <div className="space-y-3 py-2">
          <p className="num text-center text-muted">
            {totalDone} di {totalTarget} serie completate · {fmtClock((now - session.startedAt) / 1000)}
          </p>
          {totalDone === 0 && <p className="text-center text-sm text-gold">Nessuna serie registrata: l’allenamento non verrà salvato.</p>}
          <Button variant="primary" size="xl" className="w-full" onClick={finish}>
            <IconFlag /> {totalDone === 0 ? 'Chiudi' : 'Termina e salva'}
          </Button>
          <Button size="lg" className="w-full" onClick={() => setFinishOpen(false)}>
            Continua allenamento
          </Button>
          {totalDone > 0 && (
            <Button variant="danger" className="w-full" onClick={discard}>
              Scarta allenamento
            </Button>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function SetEntry({
  initialWeight,
  initialReps,
  weightStep,
  onComplete,
}: {
  initialWeight: number | null;
  initialReps: number | null;
  weightStep: number;
  onComplete: (w: number | null, r: number | null) => Promise<void>;
}) {
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <Stepper label="Peso" unit="kg" decimals value={weight} step={weightStep} max={1000} onChange={setWeight} />
        <Stepper label="Rep" value={reps} step={1} max={200} onChange={setReps} />
      </div>
      {/* sticky: su schermi piccoli resta visibile in fondo anche senza scorrere */}
      <Button
        variant="primary"
        size="xl"
        className="sticky bottom-2 z-10 w-full text-[19px] font-extrabold"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onComplete(weight, reps);
          } finally {
            if (mounted.current) setBusy(false);
          }
        }}
      >
        <IconCheck strokeWidth={3} /> Serie completata
      </Button>
    </div>
  );
}

function ExerciseStrip({
  exercises,
  sets,
  current,
  onSelect,
}: {
  exercises: SessionExercise[];
  sets: SetLog[];
  current: number;
  onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.children[current] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [current]);

  return (
    <div ref={ref} className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5">
      {exercises.map((e, i) => {
        const done = sets.filter((s) => s.exerciseKey === e.key).length;
        const complete = done >= e.sets;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              'tap flex h-10 max-w-[170px] shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold',
              i === current ? 'bg-fg text-bg' : 'bg-surface-2 text-muted',
            )}
          >
            <span className="truncate">{e.name}</span>
            <span
              className={cn(
                'num shrink-0 rounded-full px-1.5 text-[11px] font-bold',
                complete ? 'bg-accent text-accent-ink' : e.skipped ? 'bg-gold/20 text-gold' : i === current ? 'bg-bg/15' : 'bg-surface-3',
              )}
            >
              {e.skipped && !complete ? 'skip' : `${done}/${e.sets}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
