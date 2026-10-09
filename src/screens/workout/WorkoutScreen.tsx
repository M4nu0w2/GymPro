import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Celebration } from '../../components/Celebration';
import { useFeedback } from '../../components/Feedback';
import { IconCheck, IconChevronDown, IconFlag, IconPlus, IconSkip, IconTag } from '../../components/Icons';
import { RestTimer } from '../../components/RestTimer';
import { SetEditSheet } from '../../components/SetEditSheet';
import { Stepper } from '../../components/Stepper';
import { Button, IconButton, Sheet } from '../../components/ui';
import { useNow } from '../../hooks/useNow';
import { useWakeLock } from '../../hooks/useWakeLock';
import { playRecord, unlockAudio } from '../../lib/audio';
import { MUSCLE_LABEL, setMuscle, skipMuscleQuestion, useExerciseMeta } from '../../lib/exercises';
import { useSettings } from '../../lib/settings';
import { type ExerciseRecord, type PersonalRecordHit, computeRecord, liveRecord } from '../../lib/stats';
import { cn, fmtClock, fmtKg, fmtRest } from '../../lib/utils';
import {
  type Prefill,
  addSetToSession,
  computePrefill,
  deleteSetFromSession,
  discardWorkout,
  finishWorkout,
  patchSession,
  previousSessionsFor,
  updateSetInSession,
} from '../../lib/workout';
import { MUSCLES, type Session, type SessionExercise, type SetLog } from '../../types';

interface Props {
  session: Session;
  onMinimize: () => void;
  onFinished: (sessionId: string | null) => void;
}

export function WorkoutScreen({ session, onMinimize, onFinished }: Props) {
  const ui = session.ui ?? { exIndex: 0, restEndsAt: null, restTotalSec: 0 };
  const count = session.exercises.length;
  const exIndex = Math.max(0, Math.min(ui.exIndex, count - 1));
  const [restExpanded, setRestExpanded] = useState(() => ui.restEndsAt != null && ui.restEndsAt > Date.now());
  const [editing, setEditing] = useState<SetLog | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [celebration, setCelebration] = useState<(PersonalRecordHit & { id: number }) | null>(null);
  const { confirm, toast } = useFeedback();

  useWakeLock(true);

  const setsFor = useCallback(
    (key: string) => session.sets.filter((s) => s.exerciseKey === key).sort((a, b) => a.setNumber - b.setNumber),
    [session.sets],
  );

  const setUi = useCallback(
    (patch: Partial<NonNullable<Session['ui']>>) =>
      patchSession(session.id, (s) => ({ ...s, ui: { ...(s.ui ?? { exIndex: 0, restEndsAt: null, restTotalSec: 0 }), ...patch } })),
    [session.id],
  );

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= count) return;
      void setUi({ exIndex: i });
    },
    [count, setUi],
  );

  const totalTarget = session.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets), 0);
  const totalDone = session.sets.length;

  const nextUnfinished = (from: number, sets: SetLog[]): number | null => {
    for (let k = 1; k <= count; k++) {
      const i = (from + k) % count;
      const e = session.exercises[i];
      if (e.skipped) continue;
      if (sets.filter((s) => s.exerciseKey === e.key).length < e.sets) return i;
    }
    return null;
  };

  const completeSet = async (index: number, weight: number | null, reps: number | null, history: ExerciseRecord | null) => {
    unlockAudio();
    const ex = session.exercises[index];
    if (reps == null || reps <= 0) {
      toast('Inserisci le ripetizioni', 'error');
      return;
    }
    const done = setsFor(ex.key);
    const setNumber = done.length + 1;
    const w = weight ?? 0;
    await addSetToSession(session.id, { exerciseName: ex.name, setNumber, weight: w, reps });

    // Record personale?
    const hit = liveRecord({ id: '', exerciseName: ex.name, exerciseKey: ex.key, setNumber, weight: w, reps, timestamp: Date.now() }, history, done);
    if (hit) {
      setCelebration({ ...hit, id: Date.now() });
      playRecord();
    }

    const simulated = [...session.sets, { exerciseKey: ex.key } as SetLog];
    const finishedThis = setNumber >= ex.sets;
    const next = finishedThis ? nextUnfinished(index, simulated) : index;
    if (finishedThis && next == null) {
      await setUi({ restEndsAt: null });
      toast('Tutte le serie completate! 💪');
      setFinishOpen(true);
      return;
    }
    const restSec = ex.restSec;
    await setUi({
      exIndex: next ?? index,
      restEndsAt: restSec > 0 ? Date.now() + restSec * 1000 : null,
      restTotalSec: restSec,
    });
    if (restSec > 0 && !hit) setRestExpanded(true);
  };

  const addExtraSet = (index: number) =>
    patchSession(session.id, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i === index ? { ...e, sets: e.sets + 1, skipped: false } : e)),
    }));

  const skipExercise = async (index: number) => {
    const ex = session.exercises[index];
    const remaining = ex.sets - setsFor(ex.key).length;
    if (remaining > 0 && !(await confirm({ title: 'Saltare esercizio?', message: `${ex.name}: ${remaining} serie non eseguite.`, confirmLabel: 'Salta' })))
      return;
    await patchSession(session.id, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i === index ? { ...e, skipped: true } : e)),
    }));
    const next = nextUnfinished(index, session.sets);
    if (next != null) goTo(next);
  };

  const adjustRest = (delta: number) => {
    if (ui.restEndsAt == null) return;
    const endsAt = Math.max(Date.now() + 1000, ui.restEndsAt + delta * 1000);
    void setUi({ restEndsAt: endsAt, restTotalSec: Math.max(ui.restTotalSec + delta, 1) });
  };

  const current = session.exercises[exIndex];
  const restDone = (fresh: boolean) => {
    setRestExpanded(false);
    void setUi({ restEndsAt: null });
    // Avviso solo se il recupero è finito con l'app in primo piano
    if (fresh && current) {
      const n = Math.min(setsFor(current.key).length + 1, current.sets);
      setBanner({ id: Date.now(), text: `${current.name} · serie ${n}` });
    }
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

  // --- Pager orizzontale (scroll-snap nativo) ---
  const pager = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(exIndex);
  const settleTimer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = pager.current;
    if (el) el.scrollLeft = exIndex * el.clientWidth;
    setVisible(exIndex);
    // solo al montaggio
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambio di esercizio deciso dall'app (serie completata, tocco sull'indicatore): anima lo scroll
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const shown = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (shown !== exIndex) el.scrollTo({ left: exIndex * el.clientWidth, behavior: 'smooth' });
  }, [exIndex]);

  const onPagerScroll = () => {
    const el = pager.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== visible) setVisible(i);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (idx !== exIndex) goTo(idx);
    }, 140);
  };

  // con la rotazione / resize mantieni la pagina corrente allineata
  useEffect(() => {
    const onResize = () => {
      const el = pager.current;
      if (el) el.scrollLeft = exIndex * el.clientWidth;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [exIndex]);

  const restRunning = ui.restEndsAt != null;
  const nextLabel = current ? `${current.name} · serie ${Math.min(setsFor(current.key).length + 1, current.sets)}` : undefined;

  return (
    <div className="anim-sheet px-safe fixed inset-0 z-30 flex flex-col bg-bg">
      {/* Header in vetro: unica superficie sfocata della schermata */}
      <header className="glass-bar pt-safe relative z-10">
        <div className="flex items-center gap-2 px-3 pt-1.5">
          <IconButton label="Riduci allenamento" onClick={onMinimize}>
            <IconChevronDown size={20} strokeWidth={2.6} />
          </IconButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-semibold text-muted">{session.planName}</p>
            <SessionClock startedAt={session.startedAt} />
          </div>
          <Button size="sm" variant="primary" onClick={() => setFinishOpen(true)}>
            Fine
          </Button>
        </div>
        <ProgressIndicator exercises={session.exercises} sets={session.sets} current={visible} onSelect={goTo} />
      </header>

      <div ref={pager} onScroll={onPagerScroll} className="pager min-h-0 flex-1" aria-label="Esercizi: scorri per cambiare">
        {session.exercises.map((ex, i) =>
          Math.abs(i - visible) <= 1 || i === exIndex ? (
            <ExercisePage
              key={i}
              index={i}
              count={count}
              ex={ex}
              session={session}
              sets={setsFor(ex.key)}
              restRunning={restRunning}
              onComplete={(w, r, h) => completeSet(i, w, r, h)}
              onEditSet={setEditing}
              onExtraSet={() => addExtraSet(i)}
              onSkip={() => skipExercise(i)}
              onNext={() => goTo(i + 1)}
            />
          ) : (
            <div key={i} aria-hidden />
          ),
        )}
      </div>

      {restRunning && ui.restEndsAt != null && (
        <RestTimer
          endsAt={ui.restEndsAt}
          totalSec={ui.restTotalSec}
          nextLabel={nextLabel}
          expanded={restExpanded}
          onExpand={setRestExpanded}
          onAdjust={adjustRest}
          onSkip={() => {
            setRestExpanded(false);
            void setUi({ restEndsAt: null });
          }}
          onDone={restDone}
        />
      )}

      {banner && <RestBanner key={banner.id} text={banner.text} onDone={() => setBanner(null)} />}
      {celebration && <Celebration hit={celebration} onDone={() => setCelebration(null)} />}

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
        <FinishBody
          startedAt={session.startedAt}
          done={totalDone}
          target={totalTarget}
          onFinish={finish}
          onContinue={() => setFinishOpen(false)}
          onDiscard={discard}
        />
      </Sheet>
    </div>
  );
}

/** Timer totale della sessione: si aggiorna da solo senza ri-renderizzare la schermata */
function SessionClock({ startedAt }: { startedAt: number }) {
  const now = useNow(1000);
  const sec = (now - startedAt) / 1000;
  const h = Math.floor(sec / 3600);
  return (
    <p className="rounded-num text-[24px] leading-tight font-bold" aria-label="Durata allenamento">
      {h > 0 ? `${h}:${fmtClock(sec - h * 3600).padStart(5, '0')}` : fmtClock(sec)}
    </p>
  );
}

function ProgressIndicator({
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
  return (
    <div className="flex gap-1 px-4 pt-2.5 pb-2.5" role="tablist" aria-label="Avanzamento">
      {exercises.map((e, i) => {
        const done = sets.filter((s) => s.exerciseKey === e.key).length;
        const pct = e.skipped && done < e.sets ? 1 : Math.min(1, done / Math.max(1, e.sets));
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === current}
            aria-label={`${e.name}: ${done} di ${e.sets} serie`}
            onClick={() => onSelect(i)}
            className="flex h-4 min-w-0 flex-1 items-center"
          >
            <span className={cn('relative block w-full overflow-hidden rounded-full bg-surface-3 transition-[height] duration-300', i === current ? 'h-[6px]' : 'h-[4px]')}>
              <span
                className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[var(--ease-ios)]', e.skipped && done < e.sets ? 'bg-faint' : 'bg-accent')}
                style={{ width: `${pct * 100}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ExercisePage({
  index,
  count,
  ex,
  session,
  sets,
  restRunning,
  onComplete,
  onEditSet,
  onExtraSet,
  onSkip,
  onNext,
}: {
  index: number;
  count: number;
  ex: SessionExercise;
  session: Session;
  sets: SetLog[];
  restRunning: boolean;
  onComplete: (w: number | null, r: number | null, history: ExerciseRecord | null) => Promise<void>;
  onEditSet: (s: SetLog) => void;
  onExtraSet: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  const settings = useSettings();
  const meta = useExerciseMeta(ex.key);
  const nextSetNumber = sets.length + 1;
  const exDone = sets.length >= ex.sets;

  // Storico precedente: ultima sessione (precompilazione) e record (celebrazione)
  const history = useLiveQuery(async () => {
    const prev = await previousSessionsFor(ex.key, session.id);
    const all = prev.flatMap((s) => s.sets.filter((x) => x.exerciseKey === ex.key));
    return { last: prev[0] ?? null, record: all.length ? computeRecord(all) : null };
  }, [ex.key, session.id]);

  const prefill = useMemo(
    () =>
      history === undefined
        ? null
        : computePrefill(nextSetNumber, history.last ?? undefined, ex.key, session.sets, ex.reps, {
            enabled: settings.progression,
            step: settings.progressionStep,
            plannedSets: ex.sets,
          }),
    [history, nextSetNumber, ex.key, ex.reps, ex.sets, session.sets, settings.progression, settings.progressionStep],
  );

  const lastTimeText = useMemo(() => {
    const last = history?.last;
    if (!last) return null;
    const ls = last.sets.filter((s) => s.exerciseKey === ex.key).sort((a, b) => a.setNumber - b.setNumber);
    return ls.length ? ls.map((s) => `${fmtKg(s.weight)}×${s.reps}`).join('  ') : null;
  }, [history, ex.key]);

  const askMuscle = meta !== undefined && !meta?.muscle && !meta?.muscleAsked;

  return (
    <section className={cn('scroll-area h-full px-4 pt-4', restRunning ? 'pb-[calc(var(--safe-bottom)+110px)]' : 'pb-[calc(var(--safe-bottom)+24px)]')} aria-label={ex.name}>
      <div className="mx-auto max-w-md">
        <p className="num text-[13px] font-semibold tracking-wide text-muted uppercase">
          Esercizio {index + 1} di {count}
        </p>
        <h1 className="mt-0.5 text-[30px] leading-[1.1] font-bold text-balance [@media(max-height:700px)]:text-[26px]">{ex.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="num rounded-full bg-surface-2 px-2.5 py-1 text-[13px] font-semibold text-fg-2">
            {ex.sets} × {ex.reps}
          </span>
          <span className="num rounded-full bg-surface-2 px-2.5 py-1 text-[13px] font-semibold text-fg-2">rec. {fmtRest(ex.restSec)}</span>
          {meta?.muscle && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-semibold text-accent">{MUSCLE_LABEL[meta.muscle]}</span>}
        </div>
        {ex.notes && <p className="mt-2.5 rounded-[14px] bg-surface px-3 py-2 text-[15px] text-fg-2">{ex.notes}</p>}

        {askMuscle && <MuscleQuestion name={ex.name} />}

        {ex.skipped && !exDone && (
          <p className="mt-3 rounded-[14px] bg-gold-soft px-3 py-2 text-center text-[15px] font-semibold text-gold">Esercizio saltato</p>
        )}

        {/* Serie corrente */}
        <div className="mt-4 rounded-[28px] bg-surface p-4 [@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[22px] font-bold">
              {exDone ? (
                <span className="text-accent">Completato ✓</span>
              ) : (
                <>
                  Serie <span className="rounded-num text-accent">{nextSetNumber}</span>
                  <span className="font-semibold text-muted"> di </span>
                  <span className="rounded-num">{ex.sets}</span>
                </>
              )}
            </p>
            {exDone && (
              <Button size="sm" variant="tinted" onClick={onExtraSet}>
                <IconPlus size={15} /> Serie extra
              </Button>
            )}
          </div>

          {lastTimeText ? (
            <p className="mt-1 text-[13px] leading-snug text-muted">
              <span className="font-semibold">Ultima volta:</span> <span className="num">{lastTimeText}</span>
            </p>
          ) : history?.last === null ? (
            <p className="mt-1 text-[13px] text-muted">Prima volta con questo esercizio</p>
          ) : null}

          {!exDone && prefill && (
            <SetEntry key={`${ex.key}-${nextSetNumber}`} prefill={prefill} weightStep={settings.weightStep} onComplete={(w, r) => onComplete(w, r, history?.record ?? null)} />
          )}
        </div>

        {/* Serie già fatte */}
        {sets.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 px-4 text-[13px] text-muted uppercase">Serie registrate · tocca per modificare</p>
            <div className="overflow-hidden rounded-[22px] bg-surface">
              {sets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onEditSet(s)}
                  className="tap-row flex h-[52px] w-full items-center gap-3 px-4 text-left shadow-[inset_0_-0.5px_0_var(--border)] last:shadow-none"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink">
                    <IconCheck size={14} strokeWidth={3.2} />
                  </span>
                  <span className="text-[15px] text-muted">Serie {s.setNumber}</span>
                  <span className="rounded-num ml-auto text-[19px] font-bold">
                    {fmtKg(s.weight)}
                    <span className="text-[13px] font-semibold text-muted"> kg</span> × {s.reps}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {!exDone && (
            <Button onClick={onExtraSet}>
              <IconPlus size={17} /> Serie extra
            </Button>
          )}
          {!ex.skipped && !exDone && (
            <Button onClick={onSkip}>
              <IconSkip size={17} /> Salta
            </Button>
          )}
          {exDone && index < count - 1 && (
            <Button variant="tinted" className="col-span-2" size="lg" onClick={onNext}>
              Prossimo esercizio →
            </Button>
          )}
        </div>
        {index < count - 1 && !exDone && <p className="mt-4 text-center text-[13px] text-faint">Scorri per cambiare esercizio</p>}
      </div>
    </section>
  );
}

function MuscleQuestion({ name }: { name: string }) {
  return (
    <div className="anim-pop mt-3 rounded-[18px] bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <IconTag size={16} className="text-accent" />
        <p className="flex-1 text-[15px] font-semibold">Che muscolo allena?</p>
        <button type="button" onClick={() => void skipMuscleQuestion(name)} className="tap text-[15px] text-muted">
          Salta
        </button>
      </div>
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        {MUSCLES.map((m) => (
          <button key={m} type="button" onClick={() => void setMuscle(name, m)} className="tap h-8 shrink-0 rounded-full bg-surface-2 px-3 text-[14px] font-semibold">
            {MUSCLE_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

function SetEntry({
  prefill,
  weightStep,
  onComplete,
}: {
  prefill: Prefill;
  weightStep: number;
  onComplete: (w: number | null, r: number | null) => Promise<void>;
}) {
  const [weight, setWeight] = useState(prefill.weight);
  const [reps, setReps] = useState(prefill.reps);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  const prog = prefill.progression;
  const usingProgression = !!prog && weight === prog.to;

  return (
    <div className="mt-3 space-y-3">
      {prog && (
        <button
          type="button"
          onClick={() => {
            if (usingProgression) {
              setWeight(prog.from);
              setReps(prog.reps ?? reps);
            } else {
              setWeight(prog.to);
              setReps(prefill.reps);
            }
          }}
          className={cn(
            'tap anim-pop flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[15px] font-semibold',
            usingProgression ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted',
          )}
          aria-label={usingProgression ? `Proposto aumento a ${fmtKg(prog.to)} kg. Tocca per tornare a ${fmtKg(prog.from)} kg` : `Tocca per provare ${fmtKg(prog.to)} kg`}
        >
          {usingProgression ? (
            <>
              ↑ Prova <span className="num">{fmtKg(prog.to)} kg</span>
              <span className="font-normal opacity-70">· tocca per {fmtKg(prog.from)}</span>
            </>
          ) : (
            <>
              Tocca per provare <span className="num">↑ {fmtKg(prog.to)} kg</span>
            </>
          )}
        </button>
      )}
      <Stepper label="Peso" unit="kg" decimals value={weight} step={weightStep} max={1000} onChange={setWeight} />
      <Stepper label="Rep" value={reps} step={1} max={200} onChange={setReps} />
      <Button
        variant="primary"
        size="xl"
        className="w-full font-bold"
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

/** Banner in vetro a fine recupero (solo con l'app in primo piano) */
function RestBanner({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <>
      <div className="anim-glow pointer-events-none fixed inset-0 z-[55] bg-accent/20" />
      <div role="alert" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[calc(var(--safe-top)+6px)]">
        <div className="glass anim-banner flex w-full max-w-md items-center gap-3 rounded-[26px] p-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
            <IconFlag size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-bold">Recupero finito — via!</p>
            <p className="truncate text-[15px] text-fg-2">{text}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function FinishBody({
  startedAt,
  done,
  target,
  onFinish,
  onContinue,
  onDiscard,
}: {
  startedAt: number;
  done: number;
  target: number;
  onFinish: () => void;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const now = useNow(1000);
  return (
    <div className="space-y-3 pb-2">
      <p className="num text-center text-[15px] text-muted">
        {done} di {target} serie · {fmtClock((now - startedAt) / 1000)}
      </p>
      {done === 0 && <p className="text-center text-[15px] text-gold">Nessuna serie registrata: l’allenamento non verrà salvato.</p>}
      <Button variant="primary" size="xl" className="w-full" onClick={onFinish}>
        <IconFlag /> {done === 0 ? 'Chiudi' : 'Termina e salva'}
      </Button>
      <Button size="lg" className="w-full" onClick={onContinue}>
        Continua allenamento
      </Button>
      {done > 0 && (
        <Button variant="danger" className="w-full" onClick={onDiscard}>
          Scarta allenamento
        </Button>
      )}
    </div>
  );
}
