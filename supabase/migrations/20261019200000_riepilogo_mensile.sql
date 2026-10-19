-- Riepilogo mese per mese per i grafici della dashboard (stesse regole delle viste
-- liquidita e saldi_persone, vedi DECISIONI.md), fino a oggi.
-- - entrate / uscite: sulla quota personale (statistiche e tasso di risparmio);
-- - movimento_liquidita: quanto è entrato o uscito davvero dal conto nel mese
--   (transazioni, acquisti e vendite di asset, rimborsi).
-- security_invoker: valgono le policy RLS dell'utente che legge.

create view public.riepilogo_mensile
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

revoke all on public.riepilogo_mensile from anon;
grant select on public.riepilogo_mensile to authenticated;
