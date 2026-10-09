import { useMemo, useState } from 'react';
import { IconChevronDown, IconDown, IconPlus, IconTrash, IconUp } from '../../components/Icons';
import { MusclePicker } from '../../components/MusclePicker';
import { Stepper } from '../../components/Stepper';
import { Button, Field, IconButton, Sheet, inputCls } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { useKnownExercises } from '../../hooks/useData';
import { db } from '../../db';
import { MUSCLE_LABEL, setMuscle, useMuscleMap } from '../../lib/exercises';
import type { Muscle, Plan, PlanExercise } from '../../types';
import { REPS_PATTERN, cleanReps, cn, fmtRest, normalizeName, uid } from '../../lib/utils';

const REST_PRESETS = [60, 90, 120, 180];

function newExercise(): PlanExercise {
  return { id: uid(), name: '', sets: 3, reps: '8-10', restSec: 90 };
}

export function PlanEditor({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const isNew = !plan;
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [exercises, setExercises] = useState<PlanExercise[]>(() =>
    plan ? plan.exercises.map((e) => ({ ...e })) : [newExercise()],
  );
  const [openId, setOpenId] = useState<string | null>(isNew ? exercises[0]?.id ?? null : null);
  const [showErrors, setShowErrors] = useState(false);
  // muscolo scelto nell'editor (per nome esercizio normalizzato); undefined = non toccato
  const [muscleEdits, setMuscleEdits] = useState<Map<string, Muscle | null>>(new Map());
  const muscleMap = useMuscleMap();
  const { toast, confirm } = useFeedback();

  const muscleOf = (exName: string): Muscle | undefined => {
    const k = normalizeName(exName);
    if (muscleEdits.has(k)) return muscleEdits.get(k) ?? undefined;
    return muscleMap?.get(k);
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Dai un nome alla scheda';
    for (const ex of exercises) {
      if (!ex.name.trim()) e[ex.id] = 'Nome esercizio mancante';
      else if (!REPS_PATTERN.test(cleanReps(ex.reps))) e[ex.id] = 'Rep: numero (8) o range (8-10)';
    }
    return e;
  }, [name, exercises]);

  const update = (id: string, patch: Partial<PlanExercise>) =>
    setExercises((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const move = (idx: number, dir: -1 | 1) =>
    setExercises((list) => {
      const j = idx + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = list.slice();
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });

  const add = () => {
    const ex = newExercise();
    setExercises((l) => [...l, ex]);
    setOpenId(ex.id);
    setTimeout(() => document.getElementById(`ex-${ex.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const remove = async (ex: PlanExercise) => {
    if (ex.name.trim() && !(await confirm({ title: 'Rimuovere esercizio?', message: ex.name, confirmLabel: 'Rimuovi', danger: true }))) return;
    setExercises((l) => l.filter((e) => e.id !== ex.id));
  };

  const save = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      const firstEx = exercises.find((e) => errors[e.id]);
      if (firstEx) setOpenId(firstEx.id);
      toast('Controlla i campi evidenziati', 'error');
      return;
    }
    const now = Date.now();
    const data: Plan = {
      id: plan?.id ?? uid(),
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      exercises: exercises.map((e) => ({
        ...e,
        name: e.name.trim(),
        reps: cleanReps(e.reps),
        notes: e.notes?.trim() || undefined,
      })),
      createdAt: plan?.createdAt ?? now,
      updatedAt: now,
    };
    await db.plans.put(data);
    for (const ex of data.exercises) {
      const k = normalizeName(ex.name);
      if (muscleEdits.has(k)) await setMuscle(ex.name, muscleEdits.get(k) ?? undefined);
    }
    toast(isNew ? 'Scheda creata' : 'Scheda salvata');
    onClose();
  };

  return (
    <Sheet
      open
      full
      onClose={onClose}
      title={isNew ? 'Nuova scheda' : 'Modifica scheda'}
      headerRight={
        <Button size="sm" variant="primary" onClick={save}>
          Salva
        </Button>
      }
    >
      <div className="space-y-5 pt-2 pb-28">
        <Field label="Nome scheda">
          <input
            className={cn(inputCls, showErrors && errors.name && '!ring-2 !ring-danger')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Push A, Gambe, Full body"
            autoCapitalize="sentences"
          />
        </Field>
        <Field label="Descrizione (opzionale)">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Note sulla scheda" />
        </Field>

        <h3 className="px-4 text-[13px] text-muted uppercase">Esercizi · {exercises.length}</h3>

        <div className="space-y-2.5">
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              index={i}
              count={exercises.length}
              open={openId === ex.id}
              error={showErrors ? errors[ex.id] : undefined}
              muscle={muscleOf(ex.name)}
              onMuscle={(m) => setMuscleEdits((map) => new Map(map).set(normalizeName(ex.name), m ?? null))}
              onToggle={() => setOpenId(openId === ex.id ? null : ex.id)}
              onChange={(p) => update(ex.id, p)}
              onMove={(d) => move(i, d)}
              onRemove={() => remove(ex)}
            />
          ))}
        </div>

        <Button size="lg" variant="tinted" className="w-full" onClick={add}>
          <IconPlus size={20} /> Aggiungi esercizio
        </Button>
      </div>
    </Sheet>
  );
}

function ExerciseCard({
  ex,
  index,
  count,
  open,
  error,
  muscle,
  onMuscle,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  ex: PlanExercise;
  index: number;
  count: number;
  open: boolean;
  error?: string;
  muscle: Muscle | undefined;
  onMuscle: (m: Muscle | undefined) => void;
  onToggle: () => void;
  onChange: (p: Partial<PlanExercise>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const isCustomRest = !REST_PRESETS.includes(ex.restSec);
  return (
    <div id={`ex-${ex.id}`} className={cn('rounded-[22px] bg-surface transition-shadow', error && 'ring-2 ring-danger')}>
      <div className="flex items-center gap-1 py-2 pr-2 pl-3">
        <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted">
          {index + 1}
        </span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 px-2 py-1 text-left">
          <p className={cn('truncate text-[17px] font-semibold', !ex.name && 'text-muted')}>{ex.name || 'Nuovo esercizio'}</p>
          <p className="num truncate text-[13px] text-muted">
            {ex.sets} × {ex.reps || '?'} · rec. {fmtRest(ex.restSec)}
            {muscle ? ` · ${MUSCLE_LABEL[muscle]}` : ''}
          </p>
        </button>
        <IconButton label="Sposta su" plain disabled={index === 0} onClick={() => onMove(-1)}>
          <IconUp size={19} />
        </IconButton>
        <IconButton label="Sposta giù" plain disabled={index === count - 1} onClick={() => onMove(1)}>
          <IconDown size={19} />
        </IconButton>
        <IconButton label={open ? 'Comprimi' : 'Espandi'} onClick={onToggle}>
          <IconChevronDown size={18} className={cn('transition-transform duration-300', open && 'rotate-180')} />
        </IconButton>
      </div>

      {open && (
        <div className="anim-fade space-y-5 px-4 pt-2 pb-4">
          <Field label="Esercizio">
            <ExerciseNameInput value={ex.name} onChange={(name) => onChange({ name })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Serie" size="md" value={ex.sets} min={1} max={20} step={1} onChange={(v) => onChange({ sets: v ?? 1 })} />
            <div className="flex flex-col">
              <span className="mb-1.5 text-center text-[13px] text-muted">Rep</span>
              <input
                className={cn(inputCls, 'rounded-num !h-12 !rounded-full !bg-surface-2/60 text-center !text-[20px] font-bold')}
                value={ex.reps}
                inputMode="text"
                placeholder="8-10"
                aria-label="Rep target"
                onChange={(e) => onChange({ reps: e.target.value.replace(/[^\d\s-]/g, '') })}
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[13px] text-muted">Recupero</span>
            <div className="grid grid-cols-4 gap-2">
              {REST_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ restSec: s })}
                  className={cn('tap num h-10 rounded-full text-[15px] font-semibold', ex.restSec === s ? 'bg-accent text-accent-ink' : 'bg-surface-2')}
                >
                  {s}s
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Stepper
                label={isCustomRest ? 'Personalizzato' : 'Oppure personalizza'}
                unit="sec"
                size="md"
                value={ex.restSec}
                min={0}
                max={900}
                step={15}
                onChange={(v) => onChange({ restSec: v ?? 0 })}
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[13px] text-muted">Gruppo muscolare (opzionale)</span>
            <MusclePicker value={muscle} onChange={onMuscle} />
          </div>

          <Field label="Note (opzionale)">
            <input
              className={cn(inputCls, '!bg-surface-2/60')}
              value={ex.notes ?? ''}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Es. presa stretta, tempo 3-1-1"
            />
          </Field>

          {error && <p className="text-[15px] font-medium text-danger">{error}</p>}

          <Button variant="danger" className="w-full" onClick={onRemove}>
            <IconTrash size={17} /> Rimuovi esercizio
          </Button>
        </div>
      )}
    </div>
  );
}

function ExerciseNameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = useKnownExercises();
  const [focused, setFocused] = useState(false);
  const q = normalizeName(value);
  const suggestions = useMemo(
    () =>
      q
        ? known
            .filter((n) => {
              const k = normalizeName(n);
              return k.includes(q) && k !== q;
            })
            .slice(0, 6)
        : known.slice(0, 6),
    [known, q],
  );
  return (
    <div className="relative">
      <input
        className={cn(inputCls, '!bg-surface-2/60')}
        value={value}
        placeholder="Es. Panca piana"
        autoCapitalize="sentences"
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => onChange(e.target.value)}
      />
      {focused && suggestions.length > 0 && (
        <div className="anim-fade absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-[18px] bg-elevated shadow-xl ring-[0.5px] ring-line">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s);
                setFocused(false);
              }}
              className="tap-row block w-full truncate px-4 py-3 text-left text-[17px] shadow-[inset_0_-0.5px_0_var(--border)] last:shadow-none"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
