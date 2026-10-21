-- Scorciatoie di categoria (vedi DECISIONI.md): pulsanti nella schermata di una nuova
-- transazione che impostano in un tocco tipo e percorso macro > categoria > micro.
-- Eliminando una categoria si eliminano anche le scorciatoie che la usano.

create table public.scorciatoie_categoria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('spesa', 'incasso')),
  macrocategoria_id uuid not null references public.macrocategorie (id) on delete cascade,
  categoria_id uuid references public.categorie (id) on delete cascade,
  microcategoria_id uuid references public.microcategorie (id) on delete cascade,
  nome text check (nome is null or length(trim(nome)) > 0), -- vuoto: si usa il nome della voce più interna
  ordine integer not null default 0,
  created_at timestamptz not null default now(),
  check (microcategoria_id is null or categoria_id is not null)
);

create index on public.scorciatoie_categoria (user_id);
create index on public.scorciatoie_categoria (macrocategoria_id);
create index on public.scorciatoie_categoria (categoria_id);
create index on public.scorciatoie_categoria (microcategoria_id);

revoke all on public.scorciatoie_categoria from anon;
grant select, insert, update, delete on public.scorciatoie_categoria to authenticated;
alter table public.scorciatoie_categoria enable row level security;
create policy "Accesso solo al proprietario" on public.scorciatoie_categoria
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
