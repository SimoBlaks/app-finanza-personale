-- Rettifiche di liquidità (vedi DECISIONI.md): allineano la liquidità dell'app al saldo
-- reale dei conti quando c'è una differenza che non si riesce a ricostruire.
-- Contano nella liquidità (e quindi nel patrimonio) ma non sono né spese né entrate.

create table public.rettifiche_liquidita (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null default current_date,
  importo numeric(14,2) not null check (importo <> 0), -- positivo: aggiunge liquidità; negativo: la toglie
  nota text,
  created_at timestamptz not null default now()
);

create index on public.rettifiche_liquidita (user_id);

revoke all on public.rettifiche_liquidita from anon;
grant select, insert, update, delete on public.rettifiche_liquidita to authenticated;
alter table public.rettifiche_liquidita enable row level security;
create policy "Accesso solo al proprietario" on public.rettifiche_liquidita
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Liquidità: le rettifiche si sommano ai movimenti dei rimborsi (colonne invariate).
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
  round(i.saldo_iniziale + t.movimenti + o.movimenti + pr.movimenti + r.movimenti + rt.movimenti, 2) as liquidita
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
) r
cross join lateral (
  select coalesce(sum(rl.importo), 0) as movimenti
  from public.rettifiche_liquidita rl
  where rl.user_id = i.user_id and rl.data between i.data_saldo_iniziale and oggi.d
) rt;

-- Riepilogo mensile: le rettifiche muovono la liquidità ma non sono entrate né uscite.
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
  union all
  select rl.user_id, date_trunc('month', rl.data)::date, 0, 0, rl.importo
  from public.rettifiche_liquidita rl cross join oggi
  where rl.data <= oggi.d
)
select
  user_id,
  mese,
  sum(entrate) as entrate,
  sum(uscite) as uscite,
  round(sum(liquidita), 2) as movimento_liquidita
from movimenti
group by user_id, mese;
