-- Nuova tipologia di asset "fondo" (es. fondo pensione): quotato a prezzo unitario
-- come azioni ed ETF (il vincolo tipologia/quotazione resta invariato).

alter table public.asset drop constraint asset_tipologia_check;
alter table public.asset
  add constraint asset_tipologia_check check (tipologia in ('azione', 'etf', 'obbligazione', 'fondo'));
