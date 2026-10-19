-- Passo 6: viste di calcolo per la dashboard (regole in DECISIONI.md).
-- security_invoker: valgono le policy RLS dell'utente che legge.

-- Liquidità = saldo iniziale + movimenti dalla data del saldo iniziale fino a oggi.
-- - incassi: + importo; spese: − quanto è uscito davvero dal conto
--   (spesa condivisa pagata dall'altra persona: 0);
-- - acquisti di asset: − (valore + spese); vendite: + liquidità incassata;
-- - rimborsi: + ricevuti, − pagati.
create view public.liquidita
with (security_invoker = true)
as
with oggi as (select (now() at time zone 'Europe/Rome')::date as d)
select
  i.user_id,
  i.saldo_iniziale,
  i.data_saldo_iniziale,
  t.movimenti as movimenti_transazioni,
  o.movimenti as movimenti_investimenti,
  r.movimenti as movimenti_rimborsi,
  round(i.saldo_iniziale + t.movimenti + o.movimenti + r.movimenti, 2) as liquidita
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
  select coalesce(sum(case when ps.direzione = 'ricevuto' then ps.importo else -ps.importo end), 0) as movimenti
  from public.pagamenti_saldo ps
  where ps.user_id = i.user_id and ps.data between i.data_saldo_iniziale and oggi.d
) r;

-- Saldo netto con ogni persona (positivo = mi deve, negativo = le devo), fino a oggi.
-- - spesa condivisa pagata da me: mi deve la sua quota (importo − mia quota);
-- - pagata dall'altra persona: le devo la mia quota;
-- - rimborso ricevuto: il suo debito cala; rimborso pagato: il mio debito cala.
create view public.saldi_persone
with (security_invoker = true)
as
with oggi as (select (now() at time zone 'Europe/Rome')::date as d)
select
  p.id as persona_id,
  p.nome,
  p.attiva,
  round(
    coalesce((
      select sum(case when tr.pagata_da = 'io' then tr.importo_totale - tr.quota_personale else -tr.quota_personale end)
      from public.transazioni tr
      where tr.persona_id = p.id and tr.condivisa and tr.data <= oggi.d
    ), 0)
    + coalesce((
      select sum(case when ps.direzione = 'ricevuto' then -ps.importo else ps.importo end)
      from public.pagamenti_saldo ps
      where ps.persona_id = p.id and ps.data <= oggi.d
    ), 0),
  2) as saldo
from public.persone p
cross join oggi;

revoke all on public.liquidita, public.saldi_persone from anon;
grant select on public.liquidita, public.saldi_persone to authenticated;
