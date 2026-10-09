import type { Session as AuthSession, SupabaseClient } from '@supabase/supabase-js';
import type { Remote, RemoteRecord } from './engine';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true se le variabili d'ambiente di Supabase sono state configurate in build */
export const cloudConfigured = !!(URL && KEY);
export const appleLoginEnabled = cloudConfigured && import.meta.env.VITE_AUTH_APPLE === 'true';

let clientPromise: Promise<SupabaseClient> | null = null;

/** Il client viene caricato solo se serve: l'app in modalità locale non scarica nulla */
export function getClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('Supabase non configurato'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL!, KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    }),
  );
  return clientPromise;
}

export type { AuthSession };

const PAGE = 1000;

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async push(records: RemoteRecord[]) {
      const { error } = await client.rpc('push_records', { records });
      if (error) throw new Error(error.message);
    },
    async pull(since) {
      const out: RemoteRecord[] = [];
      let cursor = since;
      for (;;) {
        let q = client
          .from('records')
          .select('table_name,id,data,updated_at,deleted,server_updated_at')
          .order('server_updated_at', { ascending: true })
          .limit(PAGE);
        if (cursor) q = q.gt('server_updated_at', cursor);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as RemoteRecord[];
        for (const r of rows) out.push({ ...r, updated_at: Number(r.updated_at) });
        if (rows.length < PAGE) break;
        cursor = rows[rows.length - 1].server_updated_at ?? cursor;
      }
      return out;
    },
  };
}

/** Pagina di ritorno per OAuth / link email (funziona anche su GitHub Pages in sottocartella) */
export function redirectUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
