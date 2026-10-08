import Dexie, { type EntityTable } from 'dexie';
import type { Plan, Session } from './types';

export const db = new Dexie('gympro') as Dexie & {
  plans: EntityTable<Plan, 'id'>;
  sessions: EntityTable<Session, 'id'>;
};

db.version(1).stores({
  plans: 'id, name, createdAt',
  sessions: 'id, planId, startedAt, status, *exerciseKeys',
});

// Chiede al browser di non cancellare i dati in caso di poco spazio
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
