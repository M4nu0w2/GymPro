import { db } from '../db';
import type { Plan, Session } from '../types';
import { addDays, startOfWeek } from './stats';

/**
 * Planning settimanale: ogni scheda ricorda i giorni in cui è pianificata (`Plan.days`),
 * così il planning viaggia con le schede anche nella sincronizzazione cloud.
 * La streak conta le settimane in cui hai fatto almeno tanti allenamenti quanti ne avevi
 * pianificati, in qualunque giorno: saltare il giorno previsto non la interrompe.
 */

export const WEEKDAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

/** Indice del giorno della settimana (0 = lunedì) */
export function weekdayOf(ts: number): number {
  return (new Date(ts).getDay() + 6) % 7;
}

/** Scheda pianificata per ogni giorno (lun → dom), null = riposo */
export function weekSchedule(plans: Plan[]): (Plan | null)[] {
  const out: (Plan | null)[] = Array(7).fill(null);
  for (const p of plans) {
    if (!p.exercises.length) continue;
    for (const d of p.days ?? []) if (d >= 0 && d < 7 && !out[d]) out[d] = p;
  }
  return out;
}

/** Allenamenti pianificati a settimana */
export function weekGoal(plans: Plan[]): number {
  return weekSchedule(plans).filter(Boolean).length;
}

/** Assegna una scheda (o il riposo) a un giorno: il giorno viene tolto alle altre schede */
export async function assignDay(day: number, planId: string | null): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    for (const p of await db.plans.toArray()) {
      const has = p.days?.includes(day) ?? false;
      const want = p.id === planId;
      if (has === want) continue;
      const days = want ? [...(p.days ?? []), day].sort((a, b) => a - b) : (p.days ?? []).filter((d) => d !== day);
      await db.plans.update(p.id, { days });
    }
  });
}

export interface PlanStreak {
  /** Settimane di fila con l'obiettivo raggiunto (la settimana in corso conta solo se già completata) */
  weeks: number;
  /** Allenamenti fatti nella settimana in corso */
  done: number;
  /** Obiettivo della settimana in corso (0 = nessun planning: basta un allenamento) */
  goal: number;
}

/**
 * Ogni settimana passata viene valutata con l'obiettivo in vigore allora
 * (`Session.weekGoal` dell'ultima sessione della settimana); le sessioni senza
 * planning valgono come obiettivo 1. La settimana in corso non interrompe la serie.
 */
export function planStreak(sessions: Session[], goal: number, now = Date.now()): PlanStreak {
  const weeks = new Map<number, { count: number; goal: number; last: number }>();
  for (const s of sessions) {
    const w = startOfWeek(s.startedAt);
    const e = weeks.get(w) ?? { count: 0, goal: 0, last: -Infinity };
    e.count++;
    if (s.startedAt >= e.last) {
      e.last = s.startedAt;
      e.goal = s.weekGoal ?? 0;
    }
    weeks.set(w, e);
  }
  const cur = startOfWeek(now);
  const done = weeks.get(cur)?.count ?? 0;
  let n = done >= Math.max(1, goal) ? 1 : 0;
  let w = startOfWeek(addDays(cur, -1));
  for (let e = weeks.get(w); e && e.count >= Math.max(1, e.goal); e = weeks.get(w)) {
    n++;
    w = startOfWeek(addDays(w, -1));
  }
  return { weeks: n, done, goal };
}
