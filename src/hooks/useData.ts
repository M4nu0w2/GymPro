import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { normalizeName } from '../lib/utils';

export function usePlans() {
  return useLiveQuery(() => db.plans.orderBy('createdAt').reverse().toArray(), []);
}

export function useActiveSession() {
  // null = caricato ma nessuna sessione attiva; undefined = in caricamento
  return useLiveQuery(async () => (await db.sessions.where('status').equals('active').first()) ?? null, []);
}

export function useDoneSessions() {
  return useLiveQuery(
    async () => (await db.sessions.orderBy('startedAt').reverse().toArray()).filter((s) => s.status === 'done'),
    [],
  );
}

/** Nomi esercizio già usati (schede + storico), per l'autocompletamento */
export function useKnownExercises(): string[] {
  return (
    useLiveQuery(async () => {
      const names = new Map<string, string>();
      const sessions = await db.sessions.toArray();
      for (const s of sessions) for (const set of s.sets) names.set(set.exerciseKey, set.exerciseName);
      const plans = await db.plans.toArray();
      for (const p of plans) for (const e of p.exercises) if (e.name.trim()) names.set(normalizeName(e.name), e.name.trim());
      return [...names.values()].sort((a, b) => a.localeCompare(b, 'it'));
    }, []) ?? []
  );
}
