import type { Session, SetLog } from '../types';

/** 1RM stimato (Epley) */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function setVolume(s: SetLog): number {
  return s.weight * s.reps;
}

export function sessionVolume(session: Session): number {
  return session.sets.reduce((acc, s) => acc + setVolume(s), 0);
}

export interface ExerciseRecord {
  maxWeight: number;
  maxWeightReps: number;
  best1RM: number;
  bestVolumeSession: number;
}

export function computeRecord(sets: SetLog[]): ExerciseRecord {
  const r: ExerciseRecord = { maxWeight: 0, maxWeightReps: 0, best1RM: 0, bestVolumeSession: 0 };
  for (const s of sets) {
    if (s.reps <= 0) continue;
    if (s.weight > r.maxWeight || (s.weight === r.maxWeight && s.reps > r.maxWeightReps)) {
      r.maxWeight = s.weight;
      r.maxWeightReps = s.reps;
    }
    r.best1RM = Math.max(r.best1RM, estimate1RM(s.weight, s.reps));
  }
  return r;
}

export interface ExercisePoint {
  sessionId: string;
  date: number;
  maxWeight: number;
  best1RM: number;
  volume: number;
  sets: SetLog[];
}

/** Punti per il grafico di un esercizio, ordinati per data */
export function exerciseSeries(sessions: Session[], key: string): ExercisePoint[] {
  return sessions
    .map((sess) => {
      const sets = sess.sets.filter((s) => s.exerciseKey === key).sort((a, b) => a.setNumber - b.setNumber);
      return {
        sessionId: sess.id,
        date: sess.startedAt,
        maxWeight: Math.max(0, ...sets.map((s) => s.weight)),
        best1RM: Math.max(0, ...sets.map((s) => estimate1RM(s.weight, s.reps))),
        volume: sets.reduce((a, s) => a + setVolume(s), 0),
        sets,
      };
    })
    .filter((p) => p.sets.length > 0)
    .sort((a, b) => a.date - b.date);
}

export interface PersonalRecordHit {
  exerciseName: string;
  kind: 'peso' | '1RM';
  value: number;
  previous: number;
  set: SetLog;
}

/** Record personali stabiliti in una sessione rispetto a tutte le sessioni precedenti */
export function findSessionPRs(session: Session, previous: Session[]): PersonalRecordHit[] {
  const hits: PersonalRecordHit[] = [];
  const keys = [...new Set(session.sets.map((s) => s.exerciseKey))];
  for (const key of keys) {
    const before = previous
      .filter((p) => p.id !== session.id && p.startedAt < session.startedAt)
      .flatMap((p) => p.sets.filter((s) => s.exerciseKey === key));
    // Senza storico precedente non ha senso parlare di record
    if (before.length === 0) continue;
    const prev = computeRecord(before);
    const now = session.sets.filter((s) => s.exerciseKey === key && s.reps > 0);
    const bestW = now.reduce<SetLog | null>((b, s) => (!b || s.weight > b.weight ? s : b), null);
    const best1 = now.reduce<SetLog | null>(
      (b, s) => (!b || estimate1RM(s.weight, s.reps) > estimate1RM(b.weight, b.reps) ? s : b),
      null,
    );
    if (bestW && bestW.weight > prev.maxWeight) {
      hits.push({ exerciseName: bestW.exerciseName, kind: 'peso', value: bestW.weight, previous: prev.maxWeight, set: bestW });
    } else if (best1 && estimate1RM(best1.weight, best1.reps) > prev.best1RM + 0.01) {
      hits.push({
        exerciseName: best1.exerciseName,
        kind: '1RM',
        value: estimate1RM(best1.weight, best1.reps),
        previous: prev.best1RM,
        set: best1,
      });
    }
  }
  return hits;
}

// --- Calendario e streak ---

/** Chiave giorno locale YYYY-MM-DD */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Lunedì 00:00 della settimana di `ts` */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // lun = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function trainingDays(sessions: Session[]): Set<string> {
  return new Set(sessions.map((s) => dayKey(s.startedAt)));
}

/** Giorni consecutivi di allenamento fino a oggi (o ieri: la streak resta viva fino a fine giornata) */
export function dayStreak(days: Set<string>, now = Date.now()): number {
  let cur = startOfDay(now);
  if (!days.has(dayKey(cur))) cur = addDays(cur, -1);
  let n = 0;
  while (days.has(dayKey(cur))) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

/** Settimane consecutive con almeno un allenamento (la settimana in corso non interrompe la serie) */
export function weekStreak(sessions: Session[], now = Date.now()): number {
  const weeks = new Set(sessions.map((s) => startOfWeek(s.startedAt)));
  let cur = startOfWeek(now);
  if (!weeks.has(cur)) cur = startOfWeek(addDays(cur, -1));
  let n = 0;
  while (weeks.has(cur)) {
    n++;
    cur = startOfWeek(addDays(cur, -1));
  }
  return n;
}

// --- Volume per gruppo muscolare ---

export function weeklyVolumeByMuscle<M extends string>(
  sessions: Session[],
  weekStart: number,
  muscleOf: (key: string) => M | undefined,
): { muscle: M | null; volume: number; sets: number }[] {
  const end = addDays(weekStart, 7);
  const acc = new Map<M | null, { volume: number; sets: number }>();
  for (const s of sessions) {
    if (s.startedAt < weekStart || s.startedAt >= end) continue;
    for (const set of s.sets) {
      const m = muscleOf(set.exerciseKey) ?? null;
      const cur = acc.get(m) ?? { volume: 0, sets: 0 };
      cur.volume += setVolume(set);
      cur.sets += 1;
      acc.set(m, cur);
    }
  }
  return [...acc.entries()].map(([muscle, v]) => ({ muscle, ...v })).sort((a, b) => b.volume - a.volume);
}

// --- Record personali ---

/** Record stabiliti in ogni sessione, calcolati in un solo passaggio cronologico */
export function prTimeline(sessions: Session[]): Map<string, PersonalRecordHit[]> {
  const out = new Map<string, PersonalRecordHit[]>();
  const best = new Map<string, ExerciseRecord>();
  const sorted = sessions.filter((s) => s.status === 'done').sort((a, b) => a.startedAt - b.startedAt);
  for (const sess of sorted) {
    const hits: PersonalRecordHit[] = [];
    const byKey = new Map<string, SetLog[]>();
    for (const set of sess.sets) if (set.reps > 0) byKey.set(set.exerciseKey, [...(byKey.get(set.exerciseKey) ?? []), set]);
    for (const [key, sets] of byKey) {
      const prev = best.get(key);
      const now = computeRecord(sets);
      if (prev) {
        const hit = checkRecord(sets, prev);
        if (hit) hits.push(hit);
        best.set(key, {
          maxWeight: Math.max(prev.maxWeight, now.maxWeight),
          maxWeightReps: now.maxWeight > prev.maxWeight ? now.maxWeightReps : prev.maxWeightReps,
          best1RM: Math.max(prev.best1RM, now.best1RM),
          bestVolumeSession: 0,
        });
      } else best.set(key, now);
    }
    if (hits.length) out.set(sess.id, hits);
  }
  return out;
}

function checkRecord(sets: SetLog[], prev: ExerciseRecord): PersonalRecordHit | null {
  const bestW = sets.reduce<SetLog | null>((b, s) => (!b || s.weight > b.weight ? s : b), null);
  const best1 = sets.reduce<SetLog | null>((b, s) => (!b || estimate1RM(s.weight, s.reps) > estimate1RM(b.weight, b.reps) ? s : b), null);
  if (bestW && bestW.weight > prev.maxWeight) {
    return { exerciseName: bestW.exerciseName, kind: 'peso', value: bestW.weight, previous: prev.maxWeight, set: bestW };
  }
  if (best1 && estimate1RM(best1.weight, best1.reps) > prev.best1RM + 0.01) {
    return { exerciseName: best1.exerciseName, kind: '1RM', value: estimate1RM(best1.weight, best1.reps), previous: prev.best1RM, set: best1 };
  }
  return null;
}

/**
 * Durante l'allenamento: la serie appena fatta è un record?
 * Confronta con lo storico precedente e con le serie già fatte oggi
 * (così il record si festeggia una volta per ogni miglioramento reale).
 */
export function liveRecord(set: SetLog, history: ExerciseRecord | null, earlierToday: SetLog[]): PersonalRecordHit | null {
  if (!history || history.maxWeight <= 0 || set.reps <= 0 || set.weight <= 0) return null;
  const today = computeRecord(earlierToday);
  const ref: ExerciseRecord = {
    maxWeight: Math.max(history.maxWeight, today.maxWeight),
    maxWeightReps: 0,
    best1RM: Math.max(history.best1RM, today.best1RM),
    bestVolumeSession: 0,
  };
  return checkRecord([set], ref);
}
