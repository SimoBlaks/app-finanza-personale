-- Passo 5a: PMC, vendite e posizioni calcolati dal database (SPEC 5 e 7).
--
-- Le operazioni di un asset vengono ripercorse in ordine cronologico
-- (data, a parità di data prima gli acquisti, poi ordine di inserimento).
-- Su ogni riga si salvano la quantità e il costo di carico residui dopo
-- l'operazione; sulle vendite anche plusvalore, tasse e liquidità incassata.
-- Il costo di carico include le spese di acquisto; dopo una vendita il PMC
-- non cambia (si toglie quantità × PMC dal costo).

alter table public.operazioni_investimento
  add column aliquota_applicata numeric(5,2) check (aliquota_applicata >= 0),
  add column quantita_residua numeric(18,6) not null default 0,
  add column costo_residuo numeric(18,6) not null default 0;

alter table public.operazioni_investimento
  add constraint operazioni_aliquota_solo_vendite
  check ((tipo = 'vendita') = (aliquota_applicata is not null));

-- Prima del salvataggio: le vendite prendono l'aliquota dall'asset (e la tengono,
-- così un cambio futuro dell'aliquota non tocca le vendite già registrate);
-- i valori calcolati ricevono un segnaposto che il ricalcolo sostituisce
-- prima della fine della transazione.
create function public.prepara_operazione_investimento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'vendita' then
    if new.aliquota_applicata is null
       or (tg_op = 'UPDATE' and (old.asset_id <> new.asset_id or old.tipo <> new.tipo)) then
      select aliquota_tassa into new.aliquota_applicata from public.asset where id = new.asset_id;
    end if;
    new.plusvalore := coalesce(new.plusvalore, 0);
    new.tasse := coalesce(new.tasse, 0);
    new.liquidita_incassata := coalesce(new.liquidita_incassata, 0);
  else
    new.aliquota_applicata := null;
    new.plusvalore := null;
    new.tasse := null;
    new.liquidita_incassata := null;
  end if;
  return new;
end;
$$;

create trigger prepara_operazione_investimento
before insert or update on public.operazioni_investimento
for each row execute function public.prepara_operazione_investimento();

-- Ricalcolo cronologico di tutte le operazioni degli asset toccati.
-- Aggiorna solo le righe i cui valori cambiano, così il ricalcolo si ferma da solo.
create function public.ricalcola_operazioni_investimento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_asset uuid;
  v_fattore numeric;
  v_quantita numeric;
  v_costo numeric;
  v_carico numeric;
  v_venduto numeric;
  v_plus numeric;
  v_tasse numeric;
  v_liquidita numeric;
  op public.operazioni_investimento;
begin
  foreach v_asset in array array[new.asset_id, old.asset_id] loop
    continue when v_asset is null;

    -- obbligazioni: prezzo in % del nominale
    select case when quotazione = 'percentuale' then 0.01 else 1 end
      into v_fattore from public.asset where id = v_asset;
    continue when v_fattore is null;

    v_quantita := 0;
    v_costo := 0;

    for op in
      select * from public.operazioni_investimento
      where asset_id = v_asset
      order by data, (tipo = 'vendita'), created_at, id
    loop
      if op.tipo = 'acquisto' then
        v_quantita := v_quantita + op.quantita;
        v_costo := v_costo + op.quantita * op.prezzo * v_fattore + op.spese;
        v_plus := null; v_tasse := null; v_liquidita := null;
      else
        if op.quantita > v_quantita then
          raise exception 'La vendita del % supera la quantità posseduta in quella data (%)',
            to_char(op.data, 'DD/MM/YYYY'), rtrim(to_char(v_quantita, 'FM999999999990.999999'), '.');
        end if;
        v_carico := v_costo * op.quantita / v_quantita;
        v_venduto := op.quantita * op.prezzo * v_fattore;
        v_plus := round(v_venduto - v_carico - op.spese, 2);
        v_tasse := round(greatest(v_plus, 0) * op.aliquota_applicata / 100, 2);
        v_liquidita := round(v_venduto - op.spese - v_tasse, 2);
        v_quantita := v_quantita - op.quantita;
        v_costo := case when v_quantita = 0 then 0 else v_costo - v_carico end;
      end if;

      if op.quantita_residua is distinct from round(v_quantita, 6)
         or op.costo_residuo is distinct from round(v_costo, 6)
         or op.plusvalore is distinct from v_plus
         or op.tasse is distinct from v_tasse
         or op.liquidita_incassata is distinct from v_liquidita then
        update public.operazioni_investimento
        set quantita_residua = round(v_quantita, 6),
            costo_residuo = round(v_costo, 6),
            plusvalore = v_plus,
            tasse = v_tasse,
            liquidita_incassata = v_liquidita
        where id = op.id;
      end if;
    end loop;
  end loop;
  return null;
end;
$$;

create constraint trigger ricalcola_operazioni_investimento
after insert or update or delete on public.operazioni_investimento
deferrable initially deferred
for each row execute function public.ricalcola_operazioni_investimento();

revoke execute on function public.prepara_operazione_investimento() from public, anon, authenticated;
revoke execute on function public.ricalcola_operazioni_investimento() from public, anon, authenticated;

-- Posizione attuale di ogni asset: lo stato dopo la sua ultima operazione.
-- pmc è nella stessa unità del prezzo (per le obbligazioni, % del nominale).
create view public.posizioni
with (security_invoker = true)
as
select distinct on (o.asset_id)
  o.asset_id,
  o.quantita_residua as quantita,
  round(o.costo_residuo, 2) as costo_carico,
  case when o.quantita_residua > 0 then
    round(o.costo_residuo / o.quantita_residua / case when a.quotazione = 'percentuale' then 0.01 else 1 end, 6)
  end as pmc
from public.operazioni_investimento o
join public.asset a on a.id = o.asset_id
order by o.asset_id, o.data desc, (o.tipo = 'vendita') desc, o.created_at desc, o.id desc;

revoke all on public.posizioni from anon;
grant select on public.posizioni to authenticated;
