import Dexie, { type EntityTable } from 'dexie';
import { installTracker } from './lib/sync/tracker';
export { SYNC_TABLES, type SyncTable } from './lib/sync/tracker';
import type { BodyEntry, ExerciseMeta, Plan, Session } from './types';

export type GymDb = Dexie & {
  plans: EntityTable<Plan, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  exercises: EntityTable<ExerciseMeta, 'key'>;
  body: EntityTable<BodyEntry, 'id'>;
};

/**
 * Schema versionato. Non modificare mai una versione già pubblicata:
 * ogni cambio va in una nuova db.version(n) con eventuale .upgrade().
 */
export function defineSchema(d: Dexie): void {
  d.version(1).stores({
    plans: 'id, name, createdAt',
    sessions: 'id, planId, startedAt, status, *exerciseKeys',
  });
  // v2: metadati esercizi (tag muscolo), peso corporeo/misure, updatedAt sulle sessioni
  d.version(2)
    .stores({
      plans: 'id, name, createdAt, updatedAt',
      sessions: 'id, planId, startedAt, status, *exerciseKeys, updatedAt',
      exercises: 'key, muscle',
      body: 'id, date',
    })
    .upgrade(async (tx) => {
      await tx
        .table('sessions')
        .toCollection()
        .modify((s: Session) => {
          if (typeof s.updatedAt !== 'number') s.updatedAt = s.endedAt ?? s.startedAt;
        });
      await tx
        .table('plans')
        .toCollection()
        .modify((p: Plan) => {
          if (typeof p.updatedAt !== 'number') p.updatedAt = p.createdAt ?? Date.now();
        });
    });
}

export function createDb(name = 'gympro'): GymDb {
  const d = new Dexie(name) as GymDb;
  defineSchema(d);
  installTracker(d);
  return d;
}

export const db = createDb();

// Chiede al browser di non cancellare i dati in caso di poco spazio
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
