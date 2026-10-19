-- Categoria facoltativa nelle transazioni (resta obbligatoria la macrocategoria).
-- Le chiavi esterne composte non controllano le righe con colonne nulle, quindi
-- aggiungiamo un vincolo: la microcategoria si può indicare solo insieme alla categoria.

alter table public.transazioni alter column categoria_id drop not null;
alter table public.transazioni
  add constraint transazioni_micro_richiede_categoria
  check (microcategoria_id is null or categoria_id is not null);

alter table public.transazioni_ricorrenti alter column categoria_id drop not null;
alter table public.transazioni_ricorrenti
  add constraint transazioni_ricorrenti_micro_richiede_categoria
  check (microcategoria_id is null or categoria_id is not null);
