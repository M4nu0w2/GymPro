-- GymPro: schema per la sincronizzazione cloud (Supabase / PostgreSQL)
-- Eseguire una volta in Supabase: SQL Editor -> New query -> incolla -> Run.
-- Lo script è idempotente: si può rieseguire senza perdere dati.

-- Una sola tabella generica: ogni riga è un record dell'app (scheda, sessione,
-- metadato esercizio, misura corporea) salvato come JSON.
create table if not exists public.records (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  table_name        text        not null check (table_name in ('plans', 'sessions', 'exercises', 'body')),
  id                text        not null,
  data              jsonb,
  updated_at        bigint      not null,          -- ms dal client: "ultima modifica vince"
  deleted           boolean     not null default false,
  server_updated_at timestamptz not null default now(),  -- cursore per il pull incrementale
  primary key (user_id, table_name, id)
);

create index if not exists records_user_server_updated_idx
  on public.records (user_id, server_updated_at);

-- server_updated_at viene sempre impostato dal server
create or replace function public.records_touch()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

-- Row Level Security: ogni utente vede e modifica solo le proprie righe
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Upsert in blocco con "ultima modifica vince": una riga viene sovrascritta solo
-- se quella in arrivo ha updated_at più recente. SECURITY INVOKER: valgono le policy RLS.
create or replace function public.push_records(records jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.records as r (user_id, table_name, id, data, updated_at, deleted)
  select auth.uid(),
         x->>'table_name',
         x->>'id',
         case when coalesce((x->>'deleted')::boolean, false) then null else x->'data' end,
         (x->>'updated_at')::bigint,
         coalesce((x->>'deleted')::boolean, false)
  from jsonb_array_elements(records) as x
  on conflict (user_id, table_name, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
    where r.updated_at < excluded.updated_at;
$$;

revoke all on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;
