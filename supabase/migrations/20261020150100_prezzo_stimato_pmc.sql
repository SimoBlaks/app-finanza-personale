-- Stima del prezzo dei piani di accumulo: per il PMC usa l'ultima operazione già ricalcolata
-- (quantità residua > 0). Gli acquisti appena creati nello stesso giro hanno ancora i valori
-- calcolati a zero, perché il ricalcolo avviene alla fine della transazione.
create or replace function privato.prezzo_stimato(p_asset uuid, p_data date, p_riserva numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select ps.prezzo_chiusura from public.prezzi_storici ps
      where ps.asset_id = p_asset and ps.data <= p_data
      order by ps.data desc limit 1),
    (select o.costo_residuo / o.quantita_residua
            / case when a.quotazione = 'percentuale' then 0.01 else 1 end
       from public.operazioni_investimento o
       join public.asset a on a.id = o.asset_id
      where o.asset_id = p_asset and o.data <= p_data and o.quantita_residua > 0
      order by o.data desc, (o.tipo = 'vendita') desc, o.created_at desc, o.id desc
      limit 1),
    p_riserva
  );
$$;

revoke execute on function privato.prezzo_stimato(uuid, date, numeric) from public, anon, authenticated;
