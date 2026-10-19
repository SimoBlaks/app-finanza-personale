-- Sostituisce in un'unica transazione tutte le percentuali geografiche di un asset,
-- così il controllo "somma = 100%" (rinviato a fine transazione) vede il risultato finale.
-- p_righe: [{"paese": "USA", "percentuale": 60}, ...]; un array vuoto toglie l'esposizione.
-- SECURITY INVOKER: valgono le policy RLS dell'utente che la chiama.

create function public.salva_esposizione_geografica(p_asset_id uuid, p_righe jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.asset where id = p_asset_id) then
    raise exception 'Asset non trovato';
  end if;

  delete from public.asset_esposizione_geografica where asset_id = p_asset_id;

  insert into public.asset_esposizione_geografica (asset_id, paese, percentuale)
  select p_asset_id, trim(r ->> 'paese'), (r ->> 'percentuale')::numeric
  from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) as r;
end;
$$;

revoke execute on function public.salva_esposizione_geografica(uuid, jsonb) from public, anon;
grant execute on function public.salva_esposizione_geografica(uuid, jsonb) to authenticated;
