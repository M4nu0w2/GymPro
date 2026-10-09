import { db } from '../db';
import type { BackupFile, BodyEntry, ExerciseMeta, Plan, PlanExercise, Session } from '../types';
import { BODY_FIELDS } from '../types';
import { parseMuscle } from './exercises';
import { normalizeName, uid } from './utils';

export async function createBackup(): Promise<BackupFile> {
  const [plans, sessions, exercises, body] = await Promise.all([
    db.plans.toArray(),
    db.sessions.toArray(),
    db.exercises.toArray(),
    db.body.toArray(),
  ]);
  return { app: 'gympro', version: 2, exportedAt: new Date().toISOString(), plans, sessions, exercises, body };
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
  const exercises = Array.isArray(data.exercises) ? data.exercises.map(sanitizeMeta).filter((e): e is ExerciseMeta => !!e) : [];
  const body = Array.isArray(data.body) ? data.body.map(sanitizeBody).filter((b): b is BodyEntry => !!b) : [];
  return { app: 'gympro', version: 2, exportedAt: String(data.exportedAt ?? ''), plans, sessions, exercises, body };
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
  await db.transaction('rw', [db.plans, db.sessions, db.exercises, db.body], async () => {
    await wipeTables();
    await db.plans.bulkPut(backup.plans);
    await db.sessions.bulkPut(backup.sessions);
    await db.exercises.bulkPut(backup.exercises ?? []);
    await db.body.bulkPut(backup.body ?? []);
  });
}

/**
 * Svuota tutte le tabelle con delete() espliciti (non clear()):
 * così le cancellazioni vengono tracciate e arrivano anche al cloud.
 */
export async function wipeTables(): Promise<void> {
  await db.transaction('rw', [db.plans, db.sessions, db.exercises, db.body], async () => {
    await db.plans.bulkDelete(await db.plans.toCollection().primaryKeys());
    await db.sessions.bulkDelete(await db.sessions.toCollection().primaryKeys());
    await db.exercises.bulkDelete(await db.exercises.toCollection().primaryKeys());
    await db.body.bulkDelete(await db.body.toCollection().primaryKeys());
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

function sanitizeMeta(e: unknown): ExerciseMeta | null {
  if (!isObj(e) || typeof e.key !== 'string' || !e.key) return null;
  const muscle = parseMuscle(e.muscle);
  return {
    key: e.key,
    name: typeof e.name === 'string' ? e.name : e.key,
    ...(muscle ? { muscle } : {}),
    ...(e.muscleAsked ? { muscleAsked: true } : {}),
  };
}

function sanitizeBody(b: unknown): BodyEntry | null {
  if (!isObj(b) || typeof b.date !== 'number') return null;
  const out: BodyEntry = { id: typeof b.id === 'string' ? b.id : uid(), date: b.date };
  for (const f of BODY_FIELDS) {
    const v = Number(b[f]);
    if (b[f] != null && Number.isFinite(v) && v > 0) out[f] = v;
  }
  return out;
}