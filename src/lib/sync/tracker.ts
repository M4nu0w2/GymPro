import type Dexie from 'dexie';
import type { Transaction } from 'dexie';
import type { GymDb } from '../../db';

/** Tabelle sincronizzate con il cloud */
export const SYNC_TABLES = ['plans', 'sessions', 'exercises', 'body'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/**
 * Traccia le modifiche locali per la sincronizzazione.
 * - Ogni scrittura locale aggiorna `updatedAt` (base del "ultima modifica vince").
 * - Ogni record toccato finisce nell'outbox (`tabella:id` -> timestamp), anche le
 *   cancellazioni: se al momento del push il record non esiste più, parte un tombstone.
 * Le scritture che arrivano dal cloud sono marcate sulla transazione e vengono ignorate.
 */

const REMOTE_FLAG = '__gymproRemote';

export type Outbox = Record<string, number>;

const memory = new Map<string, Outbox>();
const listeners = new Set<() => void>();

function storageKey(db: Dexie): string {
  return db.name === 'gympro' ? 'gympro.sync.outbox' : `gympro.sync.outbox:${db.name}`;
}

export function getOutbox(db: Dexie): Outbox {
  try {
    const raw = localStorage.getItem(storageKey(db));
    return raw ? (JSON.parse(raw) as Outbox) : {};
  } catch {
    return { ...(memory.get(db.name) ?? {}) };
  }
}

function writeOutbox(db: Dexie, o: Outbox): void {
  memory.set(db.name, o);
  try {
    localStorage.setItem(storageKey(db), JSON.stringify(o));
  } catch {
    /* storage non disponibile (test): resta in memoria */
  }
}

/** Rimuove dall'outbox le voci inviate, solo se non sono cambiate nel frattempo */
export function ackOutbox(db: Dexie, sent: Outbox): void {
  const o = getOutbox(db);
  for (const [k, ts] of Object.entries(sent)) if (o[k] === ts) delete o[k];
  writeOutbox(db, o);
}

export function clearOutbox(db: Dexie): void {
  writeOutbox(db, {});
}

export function outboxKey(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Esegue `fn` in una transazione le cui scritture non vengono tracciate (dati dal cloud) */
export function runAsRemote<T>(db: GymDb, fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [db.plans, db.sessions, db.exercises, db.body], async (tx) => {
    (tx as unknown as Record<string, boolean>)[REMOTE_FLAG] = true;
    return fn();
  });
}

function isRemote(tx: Transaction | undefined): boolean {
  let t = tx as unknown as { parent?: unknown; [REMOTE_FLAG]?: boolean } | undefined;
  while (t) {
    if (t[REMOTE_FLAG]) return true;
    t = t.parent as typeof t;
  }
  return false;
}

// Le modifiche di una transazione vengono registrate solo quando questa va a buon fine
const pendingByTx = new WeakMap<object, Outbox>();

function record(db: Dexie, tx: Transaction, table: SyncTable, id: string): void {
  let pending = pendingByTx.get(tx);
  if (!pending) {
    const p: Outbox = {};
    pending = p;
    pendingByTx.set(tx, p);
    tx.on('complete', () => {
      writeOutbox(db, { ...getOutbox(db), ...p });
      listeners.forEach((l) => l());
    });
  }
  pending[outboxKey(table, id)] = Date.now();
}

export function installTracker(db: GymDb): void {
  for (const name of SYNC_TABLES) {
    const table = db.table(name);
    const pk = name === 'exercises' ? 'key' : 'id';
    table.hook('creating', function (primKey, obj, tx) {
      if (isRemote(tx)) return;
      (obj as { updatedAt?: number }).updatedAt = Date.now();
      record(db, tx, name, String(primKey ?? (obj as Record<string, unknown>)[pk]));
    });
    table.hook('updating', function (mods, primKey, _obj, tx) {
      if (isRemote(tx)) return;
      record(db, tx, name, String(primKey));
      // non sovrascrivere un updatedAt esplicito
      return 'updatedAt' in (mods as object) ? undefined : { updatedAt: Date.now() };
    });
    table.hook('deleting', function (primKey, _obj, tx) {
      if (isRemote(tx)) return;
      record(db, tx, name, String(primKey));
    });
  }
}
