import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { ExerciseMeta, Muscle } from '../types';
import { MUSCLES } from '../types';
import { normalizeName } from './utils';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  petto: 'Petto',
  dorso: 'Dorso',
  spalle: 'Spalle',
  bicipiti: 'Bicipiti',
  tricipiti: 'Tricipiti',
  gambe: 'Gambe',
  glutei: 'Glutei',
  addome: 'Addome',
  altro: 'Altro',
};

export const UNASSIGNED_LABEL = 'Non assegnato';

/** Interpreta un valore libero (CSV, link condiviso) come gruppo muscolare */
export function parseMuscle(v: unknown): Muscle | undefined {
  if (typeof v !== 'string') return undefined;
  const n = normalizeName(v);
  if (!n) return undefined;
  const direct = MUSCLES.find((m) => m === n);
  if (direct) return direct;
  const aliases: Record<string, Muscle> = {
    schiena: 'dorso',
    spalla: 'spalle',
    bicipite: 'bicipiti',
    tricipite: 'tricipiti',
    gamba: 'gambe',
    quadricipiti: 'gambe',
    femorali: 'gambe',
    polpacci: 'gambe',
    gluteo: 'glutei',
    addominali: 'addome',
    core: 'addome',
    pettorali: 'petto',
  };
  return aliases[n];
}

/** Imposta (o rimuove) il gruppo muscolare di un esercizio, per nome */
export async function setMuscle(name: string, muscle: Muscle | undefined): Promise<void> {
  const key = normalizeName(name);
  if (!key) return;
  await db.transaction('rw', db.exercises, async () => {
    const cur = await db.exercises.get(key);
    const next: ExerciseMeta = { ...(cur ?? { key, name: name.trim() }), muscleAsked: true };
    if (muscle) next.muscle = muscle;
    else delete next.muscle;
    await db.exercises.put(next);
  });
}

/** L'utente ha saltato la domanda: non chiederlo più per questo esercizio */
export async function skipMuscleQuestion(name: string): Promise<void> {
  const key = normalizeName(name);
  await db.transaction('rw', db.exercises, async () => {
    const cur = await db.exercises.get(key);
    await db.exercises.put({ ...(cur ?? { key, name: name.trim() }), muscleAsked: true });
  });
}

/** Salva i muscoli indicati (CSV / link) senza sovrascrivere quelli già scelti dall'utente */
export async function mergeMuscles(entries: { name: string; muscle?: Muscle }[]): Promise<void> {
  const withMuscle = entries.filter((e) => e.muscle);
  if (!withMuscle.length) return;
  await db.transaction('rw', db.exercises, async () => {
    for (const e of withMuscle) {
      const key = normalizeName(e.name);
      const cur = await db.exercises.get(key);
      if (cur?.muscle) continue;
      await db.exercises.put({ ...(cur ?? { key, name: e.name.trim() }), muscle: e.muscle, muscleAsked: true });
    }
  });
}

export function useExerciseMeta(key: string | null | undefined): ExerciseMeta | null | undefined {
  return useLiveQuery(async () => (key ? ((await db.exercises.get(key)) ?? null) : null), [key]);
}

/** Mappa chiave esercizio -> muscolo, per statistiche e liste */
export function useMuscleMap(): Map<string, Muscle> | undefined {
  return useLiveQuery(async () => {
    const m = new Map<string, Muscle>();
    for (const e of await db.exercises.toArray()) if (e.muscle) m.set(e.key, e.muscle);
    return m;
  }, []);
}
