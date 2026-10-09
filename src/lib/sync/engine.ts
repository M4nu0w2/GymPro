import type { GymDb } from '../../db';
import { SYNC_TABLES, type SyncTable, ackOutbox, getOutbox, outboxKey, runAsRemote } from './tracker';

/** Riga della tabella `records` su Supabase */
export interface RemoteRecord {
  table_name: SyncTable;
  id: string;
  data: Record<string, unknown> | null;
  /** ms dal client: decide chi vince ("ultima modifica vince") */
  updated_at: number;
  deleted: boolean;
  /** timestamp del server, usato solo come cursore per il pull */
  server_updated_at?: string;
}

export interface Remote {
  push(records: RemoteRecord[]): Promise<void>;
  /** Restituisce i record modificati sul server dopo `since` (tutte le pagine) */
  pull(since: string | null): Promise<RemoteRecord[]>;
}

export interface SyncState {
  cursor: string | null;
  initialPushDone: boolean;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
}

const CHUNK = 400;
/** Il cursore viene arretrato per non perdere righe con commit ritardato: l'apply è idempotente */
const CURSOR_OVERLAP_MS = 2 * 60 * 1000;

function pkOf(table: SyncTable): 'id' | 'key' {
  return table === 'exercises' ? 'key' : 'id';
}

function tableOf(db: GymDb, t: SyncTable) {
  return db.table(t);
}

async function pushInChunks(remote: Remote, records: RemoteRecord[]): Promise<void> {
  for (let i = 0; i < records.length; i += CHUNK) await remote.push(records.slice(i, i + CHUNK));
}

function toRemote(table: SyncTable, id: string, obj: Record<string, unknown> | undefined, ts: number): RemoteRecord {
  if (!obj) return { table_name: table, id, data: null, updated_at: ts, deleted: true };
  const updated = typeof obj.updatedAt === 'number' ? obj.updatedAt : ts;
  return { table_name: table, id, data: obj, updated_at: updated, deleted: false };
}

/** Tutti i record locali (primo login: carica nel cloud senza duplicare, grazie agli ID stabili) */
async function collectAll(db: GymDb): Promise<RemoteRecord[]> {
  const out: RemoteRecord[] = [];
  for (const t of SYNC_TABLES) {
    const rows = (await tableOf(db, t).toArray()) as Record<string, unknown>[];
    for (const r of rows) out.push(toRemote(t, String(r[pkOf(t)]), r, Date.now()));
  }
  return out;
}

async function collectOutbox(db: GymDb, outbox: Record<string, number>): Promise<RemoteRecord[]> {
  const out: RemoteRecord[] = [];
  for (const [key, ts] of Object.entries(outbox)) {
    const sep = key.indexOf(':');
    const table = key.slice(0, sep) as SyncTable;
    const id = key.slice(sep + 1);
    if (!SYNC_TABLES.includes(table)) continue;
    const obj = (await tableOf(db, table).get(id)) as Record<string, unknown> | undefined;
    out.push(toRemote(table, id, obj, ts));
  }
  return out;
}

/** Applica i record remoti con la regola "ultima modifica vince" */
export async function applyRemote(db: GymDb, records: RemoteRecord[]): Promise<number> {
  const outbox = getOutbox(db);
  const remoteWon: Record<string, number> = {};
  let applied = 0;
  await runAsRemote(db, async () => {
    for (const r of records) {
      if (!SYNC_TABLES.includes(r.table_name)) continue;
      const table = tableOf(db, r.table_name);
      const local = (await table.get(r.id)) as { updatedAt?: number } | undefined;
      const key = outboxKey(r.table_name, r.id);
      const pendingTs = outbox[key];
      // Cancellazione locale non ancora inviata e più recente: vince il locale
      if (!local && pendingTs != null && pendingTs >= r.updated_at) continue;
      const localTs = local?.updatedAt ?? 0;
      if (local && localTs >= r.updated_at) continue;

      if (r.deleted) {
        if (local) {
          await table.delete(r.id);
          applied++;
        }
      } else if (r.data) {
        await table.put({ ...r.data, [pkOf(r.table_name)]: r.id, updatedAt: r.updated_at });
        applied++;
      }
      if (pendingTs != null) remoteWon[key] = pendingTs;
    }
  });
  // le modifiche locali superate dal cloud non vanno più inviate
  ackOutbox(db, remoteWon);
  return applied;
}

function maxCursor(records: RemoteRecord[], prev: string | null): string | null {
  let best = prev;
  for (const r of records) if (r.server_updated_at && (!best || r.server_updated_at > best)) best = r.server_updated_at;
  return best;
}

function backoff(cursor: string | null): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  return Number.isFinite(t) ? new Date(t - CURSOR_OVERLAP_MS).toISOString() : cursor;
}

/** Un ciclo completo: primo upload (se serve), push dell'outbox, pull delle novità */
export async function syncOnce(db: GymDb, remote: Remote, state: SyncState): Promise<{ state: SyncState; result: SyncResult }> {
  let pushed = 0;
  const next = { ...state };

  if (!next.initialPushDone) {
    const snapshot = getOutbox(db);
    const all = await collectAll(db);
    await pushInChunks(remote, all);
    // anche le cancellazioni locali già in coda
    const tomb = (await collectOutbox(db, snapshot)).filter((r) => r.deleted);
    await pushInChunks(remote, tomb);
    ackOutbox(db, snapshot);
    pushed += all.length + tomb.length;
    next.initialPushDone = true;
  } else {
    const snapshot = getOutbox(db);
    const recs = await collectOutbox(db, snapshot);
    if (recs.length) await pushInChunks(remote, recs);
    ackOutbox(db, snapshot);
    pushed += recs.length;
  }

  const incoming = await remote.pull(backoff(next.cursor));
  const applied = await applyRemote(db, incoming);
  next.cursor = maxCursor(incoming, next.cursor);

  return { state: next, result: { pushed, pulled: incoming.length, applied } };
}
