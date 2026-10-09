import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Muscle, Plan, PlanExercise } from '../types';
import { parseMuscle } from './exercises';
import { REPS_PATTERN, cleanReps, uid } from './utils';

/**
 * Condivisione schede via link: la scheda (solo la struttura, mai storico o pesi)
 * è compressa con lz-string nel frammento dell'URL, quindi non passa da nessun server.
 * Formato compatto: { v: 1, n: nome, d?: descrizione, e: [[nome, serie, rep, recupero, note?, muscolo?]] }
 */

type SharedExercise = [string, number, string, number, string?, string?];
interface SharedPlan {
  v: 1;
  n: string;
  d?: string;
  e: SharedExercise[];
}

export const SHARE_PARAM = 'scheda';

export function encodePlan(plan: Plan, muscleOf: (name: string) => Muscle | undefined): string {
  const data: SharedPlan = {
    v: 1,
    n: plan.name,
    ...(plan.description ? { d: plan.description } : {}),
    e: plan.exercises.map((e) => {
      const row: SharedExercise = [e.name, e.sets, e.reps, e.restSec];
      const m = muscleOf(e.name);
      if (e.notes || m) row.push(e.notes ?? '');
      if (m) row.push(m);
      return row;
    }),
  };
  return compressToEncodedURIComponent(JSON.stringify(data));
}

export function shareUrl(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#${SHARE_PARAM}=${code}`;
}

export interface DecodedPlan {
  plan: Plan;
  muscles: { name: string; muscle?: Muscle }[];
}

/** Decodifica e valida: lancia un Error leggibile se il link non è valido */
export function decodePlan(code: string): DecodedPlan {
  let data: unknown;
  try {
    data = JSON.parse(decompressFromEncodedURIComponent(code) ?? '');
  } catch {
    throw new Error('Link non valido o incompleto.');
  }
  const d = data as Partial<SharedPlan>;
  if (!d || d.v !== 1 || typeof d.n !== 'string' || !Array.isArray(d.e) || d.e.length === 0 || d.e.length > 60) {
    throw new Error('Link non valido o incompleto.');
  }
  const muscles: DecodedPlan['muscles'] = [];
  const exercises: PlanExercise[] = d.e.map((row) => {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !row[0].trim()) throw new Error('Esercizio non valido nel link.');
    const reps = cleanReps(String(row[2] ?? '10'));
    const ex: PlanExercise = {
      id: uid(),
      name: row[0].trim().slice(0, 80),
      sets: Math.max(1, Math.min(20, Math.round(Number(row[1]) || 3))),
      reps: REPS_PATTERN.test(reps) ? reps : '10',
      restSec: Math.max(0, Math.min(900, Math.round(Number(row[3]) || 0))),
    };
    if (typeof row[4] === 'string' && row[4].trim()) ex.notes = row[4].trim().slice(0, 200);
    muscles.push({ name: ex.name, muscle: parseMuscle(row[5]) });
    return ex;
  });
  const now = Date.now();
  return {
    plan: {
      id: uid(),
      name: d.n.trim().slice(0, 80) || 'Scheda condivisa',
      ...(typeof d.d === 'string' && d.d.trim() ? { description: d.d.trim().slice(0, 300) } : {}),
      exercises,
      createdAt: now,
      updatedAt: now,
    },
    muscles,
  };
}

/** Estrae il codice da un URL completo o da un frammento incollato */
export function extractShareCode(text: string): string | null {
  const m = text.trim().match(new RegExp(`${SHARE_PARAM}=([A-Za-z0-9+\\-$]+)`));
  return m ? m[1] : null;
}
