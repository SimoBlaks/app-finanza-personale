-- Dividendi e cedole incassati dagli investimenti (vedi DECISIONI.md).
-- Si registrano lordo e tasse; il netto è calcolato. Aumentano la liquidità,
-- non contano come entrate (statistiche e tasso di risparmio) e non toccano il PMC.

create table public.proventi_investimento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('dividendo', 'cedola')),
  asset_id uuid not null references public.asset (id),
  importo_lordo numeric(14,2) not null check (importo_lordo > 0),
  tasse numeric(14,2) not null default 0 check (tasse >= 0 and tasse <= importo_lordo),
  importo_netto numeric(14,2) generated always as (importo_lordo - tasse) stored,
  nota text,
  created_at timestamptz not null default now()
);

create index on public.proventi_investimento (user_id);
create index on public.proventi_investimento (asset_id);

revoke all on public.proventi_investimento from anon;
grant select, insert, update, delete on public.proventi_investimento to authenticated;
alter table public.proventi_investimento enable row level security;
create policy "Accesso solo al proprietario" on public.proventi_investimento
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Liquidità: i proventi netti si aggiungono ai movimenti degli investimenti.
create or replace view public.liquidita
with (security_invoker = true)
as
with oggi as (select (now() at time zone 'Europe/Rome')::date as d)
select
  i.user_id,
  i.saldo_iniziale,
  i.data_saldo_iniziale,
  t.movimenti as movimenti_transazioni,
  o.movimenti + pr.movimenti as movimenti_investimenti,
  r.movimenti as movimenti_rimborsi,
  round(i.saldo_iniziale + t.movimenti + o.movimenti + pr.movimenti + r.movimenti, 2) as liquidita
from public.impostazioni i
cross join oggi
cross join lateral (
  select coalesce(sum(
    case
      when tr.tipo = 'incasso' then tr.importo_totale
      when tr.condivisa and tr.pagata_da = 'persona' then 0
      else -tr.importo_totale
    end), 0) as movimenti
  from public.transazioni tr
  where tr.user_id = i.user_id and tr.data between i.data_saldo_iniziale and oggi.d
) t
cross join lateral (
  select coalesce(sum(
    case
      when op.tipo = 'acquisto' then
        -(op.quantita * op.prezzo * case when a.quotazione = 'percentuale' then 0.01 else 1 end + op.spese)
      else op.liquidita_incassata
    end), 0) as movimenti
  from public.operazioni_investimento op
  join public.asset a on a.id = op.asset_id
  where op.user_id = i.user_id and op.data between i.data_saldo_iniziale and oggi.d
) o
cross join lateral (
  select coalesce(sum(pv.importo_netto), 0) as movimenti
  from public.proventi_investimento pv
  where pv.user_id = i.user_id and pv.data between i.data_saldo_iniziale and oggi.d
) pr
cross join lateral (
  select coalesce(sum(case when ps.direzione = 'ricevuto' then ps.importo else -ps.importo end), 0) as movimenti
  from public.pagamenti_saldo ps
  where ps.user_id = i.user_id and ps.data between i.data_saldo_iniziale and oggi.d
) r;

-- Riepilogo mensile: i proventi muovono la liquidità ma non sono entrate.
create or replace view public.riepilogo_mensile
with (security_invoker = true)
as
with oggi as (select (now() at time zone 'Europe/Rome')::date as d),
movimenti as (
  select tr.user_id, date_trunc('month', tr.data)::date as mese,
    case when tr.tipo = 'incasso' then tr.quota_personale else 0 end as entrate,
    case when tr.tipo = 'spesa' then tr.quota_personale else 0 end as uscite,
    case
      when tr.tipo = 'incasso' then tr.importo_totale
      when tr.condivisa and tr.pagata_da = 'persona' then 0
      else -tr.importo_totale
    end as liquidita
  from public.transazioni tr cross join oggi
  where tr.data <= oggi.d
  union all
  select op.user_id, date_trunc('month', op.data)::date, 0, 0,
    case
      when op.tipo = 'acquisto' then
        -(op.quantita * op.prezzo * case when a.quotazione = 'percentuale' then 0.01 else 1 end + op.spese)
      else op.liquidita_incassata
    end
  from public.operazioni_investimento op
  join public.asset a on a.id = op.asset_id
  cross join oggi
  where op.data <= oggi.d
  union all
  select pv.user_id, date_trunc('month', pv.data)::date, 0, 0, pv.importo_netto
  from public.proventi_investimento pv cross join oggi
  where pv.data <= oggi.d
  union all
  select ps.user_id, date_trunc('month', ps.data)::date, 0, 0,
    case when ps.direzione = 'ricevuto' then ps.importo else -ps.importo end
  from public.pagamenti_saldo ps cross join oggi
  where ps.data <= oggi.d
)
select
  user_id,
  mese,
  sum(entrate) as entrate,
  sum(uscite) as uscite,
  round(sum(liquidita), 2) as movimento_liquidita
from movimenti
group by user_id, mese;
