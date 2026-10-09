import { db } from '../db';
import type { Plan, Session, SetLog } from '../types';
import { normalizeName, targetRepsMax, targetRepsMin, uid } from './utils';

export function withSets(session: Session, sets: SetLog[]): Session {
  return { ...session, sets, exerciseKeys: [...new Set(sets.map((s) => s.exerciseKey))] };
}

export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.where('status').equals('active').first();
}

export async function startWorkout(plan: Plan): Promise<Session> {
  const existing = await getActiveSession();
  if (existing) return existing;
  const session: Session = {
    id: uid(),
    planId: plan.id,
    planName: plan.name,
    startedAt: Date.now(),
    status: 'active',
    exercises: plan.exercises.map((e) => ({
      name: e.name,
      key: normalizeName(e.name),
      sets: e.sets,
      reps: e.reps,
      restSec: e.restSec,
      ...(e.notes ? { notes: e.notes } : {}),
    })),
    sets: [],
    exerciseKeys: [],
    ui: { exIndex: 0, restEndsAt: null, restTotalSec: 0 },
  };
  await db.sessions.add(session);
  return session;
}

export async function patchSession(id: string, fn: (s: Session) => Session): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (s) await db.sessions.put(fn(s));
  });
}

export async function addSetToSession(sessionId: string, set: Omit<SetLog, 'id' | 'timestamp' | 'exerciseKey'>) {
  await patchSession(sessionId, (s) =>
    withSets(s, [...s.sets, { ...set, id: uid(), exerciseKey: normalizeName(set.exerciseName), timestamp: Date.now() }]),
  );
}

export async function updateSetInSession(sessionId: string, setId: string, patch: Partial<Pick<SetLog, 'weight' | 'reps'>>) {
  await patchSession(sessionId, (s) => withSets(s, s.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x))));
}

/** Elimina una serie e rinumera le successive dello stesso esercizio */
export async function deleteSetFromSession(sessionId: string, setId: string) {
  await patchSession(sessionId, (s) => {
    const target = s.sets.find((x) => x.id === setId);
    if (!target) return s;
    const rest = s.sets.filter((x) => x.id !== setId);
    let n = 0;
    const renumbered = rest
      .slice()
      .sort((a, b) => a.setNumber - b.setNumber || a.timestamp - b.timestamp)
      .map((x) => (x.exerciseKey === target.exerciseKey ? { ...x, setNumber: ++n } : x));
    // mantiene l'ordine cronologico
    renumbered.sort((a, b) => a.timestamp - b.timestamp);
    return withSets(s, renumbered);
  });
}

export async function finishWorkout(sessionId: string): Promise<Session | undefined> {
  await patchSession(sessionId, (s) => {
    const { ui: _ui, ...rest } = s;
    return { ...rest, status: 'done', endedAt: Date.now() };
  });
  return db.sessions.get(sessionId);
}

export async function discardWorkout(sessionId: string) {
  await db.sessions.delete(sessionId);
}

/** Sessioni concluse che contengono l'esercizio, dalla più recente */
export async function previousSessionsFor(key: string, excludeId?: string): Promise<Session[]> {
  const list = await db.sessions.where('exerciseKeys').equals(key).toArray();
  return list.filter((s) => s.status === 'done' && s.id !== excludeId).sort((a, b) => b.startedAt - a.startedAt);
}

export interface Prefill {
  weight: number | null;
  reps: number | null;
  source: 'last-session' | 'last-set' | 'target' | 'none';
  /** Aumento di carico proposto: `weight` è già il valore aumentato */
  progression?: { from: number; to: number; reps: number | null };
}

export interface ProgressionOptions {
  enabled: boolean;
  /** kg da aggiungere (es. 2,5) */
  step: number;
  /** serie previste oggi per l'esercizio */
  plannedSets: number;
}

/**
 * Progressione automatica: nell'ultima sessione sono state completate tutte le serie
 * previste raggiungendo le rep target (il massimo del range, es. 10 per "8-10")?
 */
export function earnedProgression(lastSession: Session | undefined, key: string, targetReps: string, plannedSets: number): boolean {
  if (!lastSession) return false;
  const sets = lastSession.sets.filter((s) => s.exerciseKey === key);
  const planned = lastSession.exercises.find((e) => e.key === key);
  const target = targetRepsMax(planned?.reps ?? targetReps);
  const required = planned?.sets ?? plannedSets;
  if (target == null || sets.length === 0 || sets.length < required) return false;
  return sets.every((s) => s.reps >= target);
}

/**
 * Valori precompilati per la serie N:
 * 1. stessa serie dell'ultima sessione con quell'esercizio (+ incremento se guadagnato)
 * 2. altrimenti l'ultima serie registrata (anche nella sessione corrente)
 * 3. altrimenti peso vuoto e rep target
 */
export function computePrefill(
  setNumber: number,
  lastSession: Session | undefined,
  key: string,
  currentSets: SetLog[],
  targetReps: string,
  progression?: ProgressionOptions,
): Prefill {
  const lastSets = lastSession?.sets.filter((s) => s.exerciseKey === key) ?? [];
  const earned =
    !!progression?.enabled && progression.step > 0 && earnedProgression(lastSession, key, targetReps, progression.plannedSets);

  const bump = (from: SetLog, source: Prefill['source']): Prefill => {
    if (earned && from.weight > 0) {
      const to = Math.round((from.weight + progression!.step) * 100) / 100;
      // con il nuovo carico si riparte dal minimo del range
      const reps = targetRepsMin(targetReps) ?? from.reps;
      return { weight: to, reps, source, progression: { from: from.weight, to, reps: from.reps } };
    }
    return { weight: from.weight, reps: from.reps, source };
  };

  const match = lastSets.find((s) => s.setNumber === setNumber);
  if (match) return bump(match, 'last-session');

  const current = currentSets.filter((s) => s.exerciseKey === key).sort((a, b) => b.timestamp - a.timestamp);
  // nella sessione corrente il peso è già quello scelto oggi: niente ulteriore aumento
  if (current[0]) return { weight: current[0].weight, reps: current[0].reps, source: 'last-set' };
  const prev = lastSets.slice().sort((a, b) => b.timestamp - a.timestamp)[0];
  if (prev) return bump(prev, 'last-set');

  const t = targetRepsMin(targetReps);
  return { weight: null, reps: t, source: t ? 'target' : 'none' };
}
