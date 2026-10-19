-- Salva in un'unica transazione una spesa/incasso ricorrente:
-- il modello in transazioni_ricorrenti e la prima transazione reale in transazioni.
-- p_transazione: i campi della transazione (data, tipo, importo_totale, nota,
-- macrocategoria_id, categoria_id, microcategoria_id, condivisa, pagata_da,
-- persona_id, percentuale_mia). Restituisce l'id della ricorrenza.
-- SECURITY INVOKER: valgono le policy RLS dell'utente che la chiama.

create function public.crea_ricorrenza(
  p_transazione jsonb,
  p_frequenza text,
  p_prossima_scadenza date,
  p_fine_ricorrenza date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.transazioni;
  v_id uuid;
begin
  t := jsonb_populate_record(null::public.transazioni, p_transazione);
  t.data := coalesce(t.data, current_date);
  t.condivisa := coalesce(t.condivisa, false);

  -- la prima occorrenza è la transazione inserita ora: la successiva deve venire dopo,
  -- altrimenti il job delle ricorrenze la duplicherebbe
  if p_prossima_scadenza <= t.data then
    raise exception 'La prossima scadenza deve essere successiva alla data della transazione';
  end if;

  insert into public.transazioni_ricorrenti (
    tipo, importo_totale, nota, macrocategoria_id, categoria_id, microcategoria_id,
    condivisa, pagata_da, persona_id, percentuale_mia,
    frequenza, prossima_scadenza, fine_ricorrenza, attiva
  ) values (
    t.tipo, t.importo_totale, t.nota, t.macrocategoria_id, t.categoria_id, t.microcategoria_id,
    t.condivisa, t.pagata_da, t.persona_id, t.percentuale_mia,
    p_frequenza, p_prossima_scadenza, p_fine_ricorrenza,
    p_fine_ricorrenza is null or p_prossima_scadenza <= p_fine_ricorrenza
  )
  returning id into v_id;

  insert into public.transazioni (
    data, tipo, importo_totale, nota, macrocategoria_id, categoria_id, microcategoria_id,
    condivisa, pagata_da, persona_id, percentuale_mia, ricorrenza_id
  ) values (
    t.data, t.tipo, t.importo_totale, t.nota, t.macrocategoria_id, t.categoria_id, t.microcategoria_id,
    t.condivisa, t.pagata_da, t.persona_id, t.percentuale_mia, v_id
  );

  return v_id;
end;
$$;

revoke execute on function public.crea_ricorrenza(jsonb, text, date, date) from public, anon;
grant execute on function public.crea_ricorrenza(jsonb, text, date, date) to authenticated;
