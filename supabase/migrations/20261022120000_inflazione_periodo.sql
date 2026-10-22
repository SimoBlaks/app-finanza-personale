-- Investimenti conclusi (vedi DECISIONI.md): inflazione cumulata, facoltativa, nel periodo
-- in cui l'asset è stato posseduto, per calcolare ROI e TIR reali. In percentuale (es. 18.5).

alter table public.asset
  add column inflazione_periodo numeric(7,2) check (inflazione_periodo is null or inflazione_periodo > -100);
