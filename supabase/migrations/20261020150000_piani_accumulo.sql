-- Piani di accumulo (PAC) ricorrenti (vedi DECISIONI.md).
-- Un piano ha una frequenza e una o più righe (asset + importo fisso o quantità fissa).
-- Il job notturno delle ricorrenze crea a ogni scadenza un acquisto per riga, con prezzo
-- stimato (ultimo prezzo inserito, altrimenti PMC, altrimenti prezzo di riferimento della riga)
-- e lo segna "da verificare": l'utente lo corregge con i dati reali del broker.

create table public.piani_accumulo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  frequenza text not null check (frequenza in ('mensile', 'bimestrale', 'semestrale', 'annuale')),
  prossima_scadenza date not null,
  giorno_riferimento smallint not null check (giorno_riferimento between 1 and 31),
  fine_piano date,
  movimenta_liquidita boolean not null default true,
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.piani_accumulo_righe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  piano_id uuid not null references public.piani_accumulo (id) on delete cascade,
  asset_id uuid not null references public.asset (id),
  modalita text not null check (modalita in ('importo', 'quantita')),
  importo numeric(14,2) check (importo > 0),
  quantita numeric(18,6) check (quantita > 0),
  -- usato per stimare il prezzo quando l'asset non ha ancora prezzi né PMC
  prezzo_riferimento numeric(18,6) not null check (prezzo_riferimento > 0),
  spese numeric(14,2) not null default 0 check (spese >= 0),
  created_at timestamptz not null default now(),
  unique (piano_id, asset_id),
  check (
    (modalita = 'importo' and importo is not null and quantita is null)
    or (modalita = 'quantita' and quantita is not null and importo is null)
  )
);

create index on public.piani_accumulo (user_id);
create index on public.piani_accumulo_righe (user_id);
create index on public.piani_accumulo_righe (piano_id);

-- giorno di riferimento come per le ricorrenze (scadenze al 31 → ultimo giorno del mese)
create trigger imposta_giorno_riferimento
before insert on public.piani_accumulo
for each row execute function privato.imposta_giorno_riferimento();

alter table public.operazioni_investimento
  add column piano_id uuid references public.piani_accumulo (id) on delete set null,
  add column da_verificare boolean not null default false;

-- un solo acquisto per piano, asset e data: la generazione è idempotente
create unique index operazioni_piano_unico
  on public.operazioni_investimento (piano_id, asset_id, data) where piano_id is not null;

do $$
declare t text;
begin
  foreach t in array array['piani_accumulo', 'piani_accumulo_righe'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Accesso solo al proprietario" on public.%I
         for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end;
$$;

-- il registro del job conta anche gli acquisti creati dai piani
alter table public.esecuzioni_job
  add column operazioni_create integer not null default 0;

-- Prezzo stimato di un asset a una data: ultimo prezzo inserito, altrimenti PMC
-- della posizione a quella data, altrimenti il prezzo di riferimento indicato.
create function privato.prezzo_stimato(p_asset uuid, p_data date, p_riserva numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select ps.prezzo_chiusura from public.prezzi_storici ps
      where ps.asset_id = p_asset and ps.data <= p_data
      order by ps.data desc limit 1),
    (select case when o.quantita_residua > 0 then
              o.costo_residuo / o.quantita_residua
              / case when a.quotazione = 'percentuale' then 0.01 else 1 end
            end
       from public.operazioni_investimento o
       join public.asset a on a.id = o.asset_id
      where o.asset_id = p_asset and o.data <= p_data
      order by o.data desc, (o.tipo = 'vendita') desc, o.created_at desc, o.id desc
      limit 1),
    p_riserva
  );
$$;

-- Per ogni piano attivo scaduto crea gli acquisti di ogni scadenza mancante fino a oggi.
-- Restituisce il numero di acquisti creati.
create function privato.genera_piani_accumulo(p_oggi date default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_oggi date := coalesce(p_oggi, (now() at time zone 'Europe/Rome')::date);
  p public.piani_accumulo;
  r public.piani_accumulo_righe;
  v_scadenza date;
  v_mesi integer;
  v_fattore numeric;
  v_prezzo numeric;
  v_quantita numeric;
  v_righe integer;
  v_create integer := 0;
begin
  for p in
    select * from public.piani_accumulo
    where attivo and prossima_scadenza <= v_oggi
    order by id
    for update skip locked
  loop
    v_mesi := case p.frequenza
      when 'mensile' then 1 when 'bimestrale' then 2
      when 'semestrale' then 6 when 'annuale' then 12
    end;
    v_scadenza := p.prossima_scadenza;

    while v_scadenza <= v_oggi and (p.fine_piano is null or v_scadenza <= p.fine_piano) loop
      for r in select * from public.piani_accumulo_righe where piano_id = p.id order by created_at, id loop
        select case when quotazione = 'percentuale' then 0.01 else 1 end
          into v_fattore from public.asset where id = r.asset_id;
        v_prezzo := round(privato.prezzo_stimato(r.asset_id, v_scadenza, r.prezzo_riferimento), 6);
        v_quantita := case r.modalita
          when 'importo' then round(r.importo / (v_prezzo * v_fattore), 6)
          else r.quantita
        end;
        continue when v_quantita is null or v_quantita <= 0;

        insert into public.operazioni_investimento (
          user_id, data, tipo, asset_id, quantita, prezzo, spese,
          movimenta_liquidita, piano_id, da_verificare
        ) values (
          p.user_id, v_scadenza, 'acquisto', r.asset_id, v_quantita, v_prezzo, r.spese,
          p.movimenta_liquidita, p.id, true
        )
        on conflict (piano_id, asset_id, data) where piano_id is not null do nothing;
        get diagnostics v_righe = row_count;
        v_create := v_create + v_righe;
      end loop;
      v_scadenza := privato.data_dopo_mesi(v_scadenza, v_mesi, p.giorno_riferimento);
    end loop;

    update public.piani_accumulo
    set prossima_scadenza = v_scadenza,
        attivo = (fine_piano is null or v_scadenza <= fine_piano)
    where id = p.id;
  end loop;

  return v_create;
end;
$$;

-- Il job notturno genera sia le transazioni ricorrenti sia gli acquisti dei piani.
create or replace function privato.esegui_job_ricorrenze()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_transazioni integer;
  v_operazioni integer;
begin
  v_transazioni := privato.genera_transazioni_ricorrenti();
  v_operazioni := privato.genera_piani_accumulo();
  insert into public.esecuzioni_job (job, esito, transazioni_create, operazioni_create)
  values ('ricorrenze', 'ok', v_transazioni, v_operazioni);
exception when others then
  insert into public.esecuzioni_job (job, esito, messaggio)
  values ('ricorrenze', 'errore', sqlerrm);
end;
$$;

revoke execute on all functions in schema privato from public, anon, authenticated;
