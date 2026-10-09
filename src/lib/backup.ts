import { db } from '../db';
import type { BackupFile, Plan, PlanExercise, Session } from '../types';
import { normalizeName, uid } from './utils';

export async function createBackup(): Promise<BackupFile> {
  const [plans, sessions] = await Promise.all([db.plans.toArray(), db.sessions.toArray()]);
  return { app: 'gympro', version: 1, exportedAt: new Date().toISOString(), plans, sessions };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valida e normalizza un backup. Lancia un Error con messaggio leggibile se non valido. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un JSON valido.');
  }
  if (!isObj(data) || data.app !== 'gympro' || !Array.isArray(data.plans) || !Array.isArray(data.sessions)) {
    throw new Error('Il file non è un backup di GymPro.');
  }
  const plans = data.plans.map((p, i) => sanitizePlan(p, `scheda #${i + 1}`));
  const sessions = data.sessions.map((s, i) => sanitizeSession(s, i));
  return { app: 'gympro', version: 1, exportedAt: String(data.exportedAt ?? ''), plans, sessions };
}

export function sanitizePlan(p: unknown, label: string, keepId = true): Plan {
  if (!isObj(p) || typeof p.name !== 'string' || !Array.isArray(p.exercises)) {
    throw new Error(`Dati non validi in ${label}.`);
  }
  const exercises: PlanExercise[] = p.exercises.map((e, j) => {
    if (!isObj(e) || typeof e.name !== 'string' || !e.name.trim()) {
      throw new Error(`Esercizio #${j + 1} non valido in ${label}.`);
    }
    return {
      id: typeof e.id === 'string' ? e.id : uid(),
      name: e.name.trim(),
      sets: Math.max(1, Math.min(20, Number(e.sets) || 3)),
      reps: String(e.reps ?? '10'),
      restSec: Math.max(0, Math.min(900, Number(e.restSec) || 0)),
      ...(typeof e.notes === 'string' && e.notes ? { notes: e.notes } : {}),
    };
  });
  const now = Date.now();
  return {
    id: keepId && typeof p.id === 'string' ? p.id : uid(),
    name: p.name.trim() || 'Scheda',
    ...(typeof p.description === 'string' && p.description ? { description: p.description } : {}),
    exercises,
    createdAt: Number(p.createdAt) || now,
    updatedAt: Number(p.updatedAt) || now,
  };
}

function sanitizeSession(s: unknown, i: number): Session {
  if (!isObj(s) || typeof s.id !== 'string' || !Array.isArray(s.sets) || typeof s.startedAt !== 'number') {
    throw new Error(`Sessione #${i + 1} non valida.`);
  }
  const startedAt = s.startedAt;
  const sets = s.sets.map((x) => {
    if (!isObj(x) || typeof x.exerciseName !== 'string') throw new Error(`Serie non valida nella sessione #${i + 1}.`);
    return {
      id: typeof x.id === 'string' ? x.id : uid(),
      exerciseName: x.exerciseName,
      exerciseKey: normalizeName(x.exerciseName),
      setNumber: Number(x.setNumber) || 1,
      weight: Number(x.weight) || 0,
      reps: Number(x.reps) || 0,
      timestamp: Number(x.timestamp) || startedAt,
    };
  });
  const session = s as unknown as Session;
  return {
    ...session,
    exercises: Array.isArray(s.exercises) ? session.exercises : [],
    status: s.status === 'active' ? 'active' : 'done',
    sets,
    exerciseKeys: [...new Set(sets.map((x) => x.exerciseKey))],
  };
}

/** Ripristino: sostituisce tutti i dati */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', db.plans, db.sessions, async () => {
    await db.plans.clear();
    await db.sessions.clear();
    await db.plans.bulkPut(backup.plans);
    await db.sessions.bulkPut(backup.sessions);
  });
}

/** Import schede da JSON: accetta un backup, un array di schede o una singola scheda */
export function importPlansFromJson(text: string): Plan[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un JSON valido.');
  }
  const list = isObj(data) && Array.isArray(data.plans) ? data.plans : Array.isArray(data) ? data : [data];
  if (list.length === 0) throw new Error('Nessuna scheda trovata nel file.');
  return list.map((p, i) => sanitizePlan(p, `scheda #${i + 1}`, false));
}
