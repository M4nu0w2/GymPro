import { useMemo, useState } from 'react';
import { IconChevronDown, IconDown, IconPlus, IconTrash, IconUp } from '../../components/Icons';
import { Stepper } from '../../components/Stepper';
import { Button, Field, IconButton, Sheet, inputCls } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { useKnownExercises } from '../../hooks/useData';
import { db } from '../../db';
import type { Plan, PlanExercise } from '../../types';
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
  const { toast, confirm } = useFeedback();

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
      <div className="space-y-4 pt-2 pb-28">
        <Field label="Nome scheda">
          <input
            className={cn(inputCls, showErrors && errors.name && '!border-danger')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Push A, Gambe, Full body"
            autoCapitalize="sentences"
          />
        </Field>
        <Field label="Descrizione (opzionale)">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Note sulla scheda" />
        </Field>

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Esercizi · {exercises.length}
          </h3>
        </div>

        <div className="space-y-3">
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              index={i}
              count={exercises.length}
              open={openId === ex.id}
              error={showErrors ? errors[ex.id] : undefined}
              onToggle={() => setOpenId(openId === ex.id ? null : ex.id)}
              onChange={(p) => update(ex.id, p)}
              onMove={(d) => move(i, d)}
              onRemove={() => remove(ex)}
            />
          ))}
        </div>

        <Button size="lg" className="w-full border-2 border-dashed border-line !bg-transparent" onClick={add}>
          <IconPlus /> Aggiungi esercizio
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
  onToggle: () => void;
  onChange: (p: Partial<PlanExercise>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const isCustomRest = !REST_PRESETS.includes(ex.restSec);
  return (
    <div id={`ex-${ex.id}`} className={cn('rounded-3xl border bg-surface transition-colors', error ? 'border-danger' : 'border-line')}>
      <div className="flex items-center gap-1 py-2 pr-1 pl-4">
        <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-muted">
          {index + 1}
        </span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 px-2 py-1 text-left">
          <p className={cn('truncate font-semibold', !ex.name && 'text-muted')}>{ex.name || 'Nuovo esercizio'}</p>
          <p className="num text-xs text-muted">
            {ex.sets} × {ex.reps || '?'} · rec. {fmtRest(ex.restSec)}
          </p>
        </button>
        <IconButton label="Sposta su" disabled={index === 0} onClick={() => onMove(-1)}>
          <IconUp size={20} />
        </IconButton>
        <IconButton label="Sposta giù" disabled={index === count - 1} onClick={() => onMove(1)}>
          <IconDown size={20} />
        </IconButton>
        <IconButton label={open ? 'Comprimi' : 'Espandi'} onClick={onToggle}>
          <IconChevronDown size={20} className={cn('transition-transform', open && 'rotate-180')} />
        </IconButton>
      </div>

      {open && (
        <div className="anim-fade space-y-4 border-t border-line px-4 pt-4 pb-4">
          <Field label="Esercizio">
            <ExerciseNameInput value={ex.name} onChange={(name) => onChange({ name })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Serie" size="md" value={ex.sets} min={1} max={20} step={1} onChange={(v) => onChange({ sets: v ?? 1 })} />
            <div className="flex flex-col">
              <span className="mb-1.5 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted">Rep</span>
              <input
                className={cn(inputCls, 'num !h-14 text-center !text-[22px] font-extrabold')}
                value={ex.reps}
                inputMode="text"
                placeholder="8-10"
                onChange={(e) => onChange({ reps: e.target.value.replace(/[^\d\s-]/g, '') })}
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Recupero</span>
            <div className="grid grid-cols-4 gap-2">
              {REST_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ restSec: s })}
                  className={cn(
                    'tap num h-11 rounded-xl text-sm font-bold',
                    ex.restSec === s ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-fg',
                  )}
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

          <Field label="Note (opzionale)">
            <input
              className={inputCls}
              value={ex.notes ?? ''}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Es. presa stretta, tempo 3-1-1"
            />
          </Field>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <Button variant="danger" className="w-full" onClick={onRemove}>
            <IconTrash size={18} /> Rimuovi esercizio
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
        ? known.filter((n) => {
            const k = normalizeName(n);
            return k.includes(q) && k !== q;
          }).slice(0, 6)
        : known.slice(0, 6),
    [known, q],
  );

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        placeholder="Es. Panca piana"
        autoCapitalize="sentences"
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => onChange(e.target.value)}
      />
      {focused && suggestions.length > 0 && (
        <div className="anim-fade absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-xl">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s);
                setFocused(false);
              }}
              className="block w-full truncate border-b border-line px-4 py-3 text-left text-[15px] font-medium last:border-0 active:bg-surface-3"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
