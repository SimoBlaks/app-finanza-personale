-- Scorciatoie di categoria: nota facoltativa da scrivere nella transazione quando si usa la scorciatoia.

alter table public.scorciatoie_categoria
  add column nota text check (nota is null or length(trim(nota)) > 0);
