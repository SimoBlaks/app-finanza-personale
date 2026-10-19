-- Passo 4: job giornaliero che genera le transazioni ricorrenti (SPEC 4.7).

create extension if not exists pg_cron with schema pg_catalog;

-- Schema per le funzioni interne: non è esposto dalle API di Supabase.
create schema if not exists privato;
revoke all on schema privato from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Giorno di riferimento: evita che una scadenza al 31 resti al 28 dopo febbraio
-- ---------------------------------------------------------------------------

alter table public.transazioni_ricorrenti
  add column giorno_riferimento smallint check (giorno_riferimento between 1 and 31);

update public.transazioni_ricorrenti
set giorno_riferimento = extract(day from prossima_scadenza);

create function privato.imposta_giorno_riferimento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.giorno_riferimento := coalesce(new.giorno_riferimento, extract(day from new.prossima_scadenza));
  return new;
end;
$$;

create trigger imposta_giorno_riferimento
before insert on public.transazioni_ricorrenti
for each row execute function privato.imposta_giorno_riferimento();

alter table public.transazioni_ricorrenti alter column giorno_riferimento set not null;

-- Data che cade p_mesi mesi dopo p_data, al giorno p_giorno
-- (o all'ultimo giorno del mese, se quel giorno non esiste).
create function privato.data_dopo_mesi(p_data date, p_mesi integer, p_giorno integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_inizio date := (date_trunc('month', p_data) + make_interval(months => p_mesi))::date;
  v_ultimo integer := extract(day from (v_inizio + interval '1 month' - interval '1 day'));
begin
  return v_inizio + (least(p_giorno, v_ultimo) - 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Registro delle esecuzioni dei job (l'app lo legge e basta)
-- ---------------------------------------------------------------------------

create table public.esecuzioni_job (
  id bigint generated always as identity primary key,
  job text not null,
  eseguito_il timestamptz not null default now(),
  esito text not null check (esito in ('ok', 'errore')),
  transazioni_create integer not null default 0,
  messaggio text
);

create index on public.esecuzioni_job (job, eseguito_il desc);

alter table public.esecuzioni_job enable row level security;
revoke all on public.esecuzioni_job from anon, authenticated;
grant select on public.esecuzioni_job to authenticated;
create policy "Lettura per l'utente autenticato" on public.esecuzioni_job
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Generazione delle transazioni ricorrenti
-- ---------------------------------------------------------------------------

-- Per ogni ricorrenza attiva scaduta crea una transazione per ogni scadenza
-- mancante fino a oggi (recupero dei ritardi), con la data della scadenza.
-- Idempotente: il vincolo unique (ricorrenza_id, data) evita i duplicati.
-- Restituisce il numero di transazioni create.
create function privato.genera_transazioni_ricorrenti(p_oggi date default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_oggi date := coalesce(p_oggi, (now() at time zone 'Europe/Rome')::date);
  r public.transazioni_ricorrenti;
  v_scadenza date;
  v_mesi integer;
  v_righe integer;
  v_create integer := 0;
begin
  for r in
    select * from public.transazioni_ricorrenti
    where attiva and prossima_scadenza <= v_oggi
    order by id
    for update skip locked
  loop
    v_mesi := case r.frequenza
      when 'mensile' then 1 when 'bimestrale' then 2
      when 'semestrale' then 6 when 'annuale' then 12
    end;
    v_scadenza := r.prossima_scadenza;

    while v_scadenza <= v_oggi and (r.fine_ricorrenza is null or v_scadenza <= r.fine_ricorrenza) loop
      insert into public.transazioni (
        user_id, data, tipo, importo_totale, nota,
        macrocategoria_id, categoria_id, microcategoria_id,
        condivisa, pagata_da, persona_id, percentuale_mia, ricorrenza_id
      ) values (
        r.user_id, v_scadenza, r.tipo, r.importo_totale, r.nota,
        r.macrocategoria_id, r.categoria_id, r.microcategoria_id,
        r.condivisa, r.pagata_da, r.persona_id, r.percentuale_mia, r.id
      )
      on conflict (ricorrenza_id, data) do nothing;
      get diagnostics v_righe = row_count;
      v_create := v_create + v_righe;
      v_scadenza := privato.data_dopo_mesi(v_scadenza, v_mesi, r.giorno_riferimento);
    end loop;

    update public.transazioni_ricorrenti
    set prossima_scadenza = v_scadenza,
        attiva = (fine_ricorrenza is null or v_scadenza <= fine_ricorrenza)
    where id = r.id;
  end loop;

  return v_create;
end;
$$;

-- Punto d'ingresso del job: esegue la generazione e ne registra l'esito.
-- In caso di errore annulla tutto il lavoro del giro e registra il messaggio.
create function privato.esegui_job_ricorrenze()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_create integer;
begin
  v_create := privato.genera_transazioni_ricorrenti();
  insert into public.esecuzioni_job (job, esito, transazioni_create)
  values ('ricorrenze', 'ok', v_create);
exception when others then
  insert into public.esecuzioni_job (job, esito, messaggio)
  values ('ricorrenze', 'errore', sqlerrm);
end;
$$;

revoke execute on all functions in schema privato from public, anon, authenticated;

-- Ogni giorno alle 04:00 UTC (06:00 in Italia d'estate, 05:00 d'inverno).
select cron.schedule('genera-ricorrenze', '0 4 * * *', 'select privato.esegui_job_ricorrenze()');
