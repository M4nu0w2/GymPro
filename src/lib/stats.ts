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
