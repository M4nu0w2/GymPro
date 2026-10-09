import { useSyncExternalStore } from 'react';
import { db } from '../../db';
import { type SyncState, syncOnce } from './engine';
import { type AuthSession, cloudConfigured, getClient, redirectUrl, supabaseRemote } from './supabase';
import { onLocalChange } from './tracker';

/**
 * Gestore della sincronizzazione: offline-first, Dexie resta la fonte locale.
 * Sincronizza al login, quando torna la rete, quando l'app torna in primo piano,
 * qualche secondo dopo ogni modifica locale e periodicamente.
 */

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncSnapshot {
  configured: boolean;
  ready: boolean;
  user: { id: string; email?: string } | null;
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
}

let snap: SyncSnapshot = {
  configured: cloudConfigured,
  ready: !cloudConfigured,
  user: null,
  status: 'local',
  lastSyncAt: null,
  error: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<SyncSnapshot>) {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
}

export function useSync(): SyncSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
  );
}

const stateKey = (uid: string) => `gympro.sync.state.${uid}`;
const LAST_KEY = 'gympro.sync.last';

function loadState(uid: string): SyncState {
  try {
    const raw = localStorage.getItem(stateKey(uid));
    if (raw) return JSON.parse(raw) as SyncState;
  } catch {
    /* ignore */
  }
  return { cursor: null, initialPushDone: false };
}

function saveState(uid: string, s: SyncState) {
  try {
    localStorage.setItem(stateKey(uid), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

let running: Promise<void> | null = null;
let again = false;

export async function syncNow(): Promise<void> {
  const user = snap.user;
  if (!user) return;
  if (!navigator.onLine) {
    set({ status: 'offline' });
    return;
  }
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    set({ status: 'syncing', error: null });
    try {
      do {
        again = false;
        const client = await getClient();
        const { state } = await syncOnce(db, supabaseRemote(client), loadState(user.id));
        saveState(user.id, state);
      } while (again);
      const now = Date.now();
      try {
        localStorage.setItem(LAST_KEY, String(now));
      } catch {
        /* ignore */
      }
      set({ status: 'idle', lastSyncAt: now });
    } catch (e) {
      set({ status: navigator.onLine ? 'error' : 'offline', error: (e as Error).message });
    } finally {
      running = null;
    }
  })();
  return running;
}

let debounce: number | undefined;
function scheduleSync(ms = 3000) {
  if (!snap.user) return;
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => void syncNow(), ms);
}

function applySession(session: AuthSession | null) {
  const user = session?.user ? { id: session.user.id, email: session.user.email } : null;
  const changed = user?.id !== snap.user?.id;
  set({ user, ready: true, status: user ? (navigator.onLine ? 'idle' : 'offline') : 'local' });
  if (user && changed) void syncNow();
}

/** Da chiamare una volta all'avvio */
export function initSync(): void {
  if (!cloudConfigured) return;
  try {
    const last = Number(localStorage.getItem(LAST_KEY));
    if (last) snap = { ...snap, lastSyncAt: last };
  } catch {
    /* ignore */
  }
  void getClient()
    .then(async (client) => {
      client.auth.onAuthStateChange((_event, session) => applySession(session));
      const { data } = await client.auth.getSession();
      applySession(data.session);
    })
    .catch((e: Error) => set({ ready: true, status: 'error', error: e.message }));

  onLocalChange(() => scheduleSync());
  window.addEventListener('online', () => scheduleSync(500));
  window.addEventListener('offline', () => snap.user && set({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(800);
  });
  window.setInterval(() => scheduleSync(0), 5 * 60 * 1000);
}

// --- Autenticazione ---

/** Invia l'email con codice a 6 cifre (e link). Il codice funziona anche dentro la web app installata. */
export async function sendEmailCode(email: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw new Error(error.message);
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

/** Registrazione: restituisce true se serve confermare l'email */
export async function signUp(email: string, password: string): Promise<boolean> {
  const client = await getClient();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw new Error(error.message);
  return !data.session;
}

export async function signInWithApple(): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: redirectUrl() } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const client = await getClient();
  await client.auth.signOut();
}
