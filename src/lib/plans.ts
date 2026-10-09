import type { Plan, Session } from '../types';

/**
 * Scheda suggerita per il prossimo allenamento:
 * la successiva (in ordine di creazione) rispetto all'ultima eseguita;
 * se l'ultima scheda non esiste più, quella fatta meno di recente (o mai fatta).
 */
export function suggestNextPlan(plans: Plan[], doneSessions: Session[]): Plan | null {
  const usable = plans.filter((p) => p.exercises.length > 0).sort((a, b) => a.createdAt - b.createdAt);
  if (!usable.length) return null;
  const last = doneSessions.slice().sort((a, b) => b.startedAt - a.startedAt)[0];
  if (last) {
    const i = usable.findIndex((p) => p.id === last.planId);
    if (i !== -1) return usable[(i + 1) % usable.length];
  }
  const lastDone = new Map<string, number>();
  for (const s of doneSessions) lastDone.set(s.planId, Math.max(lastDone.get(s.planId) ?? 0, s.startedAt));
  return usable.slice().sort((a, b) => (lastDone.get(a.id) ?? 0) - (lastDone.get(b.id) ?? 0))[0];
}
