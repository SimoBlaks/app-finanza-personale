-- Passo 1: schema iniziale (tabelle, vincoli, RLS e policy).
-- Ogni tabella ha user_id: la riga appartiene all'utente che l'ha creata
-- e le policy RLS consentono l'accesso solo a lui.

-- ---------------------------------------------------------------------------
-- Categorie (gerarchia a tre livelli)
-- ---------------------------------------------------------------------------

create table public.macrocategorie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, nome)
);

create table public.categorie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  macrocategoria_id uuid not null references public.macrocategorie (id),
  nome text not null check (length(trim(nome)) > 0),
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  unique (macrocategoria_id, nome),
  -- serve alle chiavi esterne composte che garantiscono la coerenza della gerarchia
  unique (id, macrocategoria_id)
);

create table public.microcategorie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria_id uuid not null references public.categorie (id),
  nome text not null check (length(trim(nome)) > 0),
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  unique (categoria_id, nome),
  unique (id, categoria_id)
);

-- ---------------------------------------------------------------------------
-- Persone con cui si dividono le spese
-- ---------------------------------------------------------------------------

create table public.persone (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, nome)
);

-- ---------------------------------------------------------------------------
-- Transazioni ricorrenti (modello da cui il job genera le transazioni)
-- ---------------------------------------------------------------------------

create table public.transazioni_ricorrenti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('spesa', 'incasso')),
  importo_totale numeric(14,2) not null check (importo_totale > 0),
  nota text,
  macrocategoria_id uuid not null references public.macrocategorie (id),
  categoria_id uuid not null,
  microcategoria_id uuid,
  condivisa boolean not null default false,
  pagata_da text check (pagata_da in ('io', 'persona')),
  persona_id uuid references public.persone (id),
  percentuale_mia numeric(5,2) check (percentuale_mia between 0 and 100),
  quota_personale numeric(14,2) generated always as (
    case when condivisa then round(importo_totale * percentuale_mia / 100, 2)
         else importo_totale end
  ) stored,
  frequenza text not null check (frequenza in ('mensile', 'bimestrale', 'semestrale', 'annuale')),
  prossima_scadenza date not null,
  fine_ricorrenza date,
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (categoria_id, macrocategoria_id) references public.categorie (id, macrocategoria_id),
  foreign key (microcategoria_id, categoria_id) references public.microcategorie (id, categoria_id),
  check (not condivisa or tipo = 'spesa'),
  check (
    (condivisa and pagata_da is not null and persona_id is not null and percentuale_mia is not null)
    or (not condivisa and pagata_da is null and persona_id is null and percentuale_mia is null)
  )
);

-- ---------------------------------------------------------------------------
-- Transazioni (spese e incassi)
-- ---------------------------------------------------------------------------

create table public.transazioni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('spesa', 'incasso')),
  importo_totale numeric(14,2) not null check (importo_totale > 0),
  nota text,
  macrocategoria_id uuid not null references public.macrocategorie (id),
  categoria_id uuid not null,
  microcategoria_id uuid,
  condivisa boolean not null default false,
  pagata_da text check (pagata_da in ('io', 'persona')),
  persona_id uuid references public.persone (id),
  percentuale_mia numeric(5,2) check (percentuale_mia between 0 and 100),
  -- quota personale calcolata dal database: importo totale se non condivisa
  quota_personale numeric(14,2) generated always as (
    case when condivisa then round(importo_totale * percentuale_mia / 100, 2)
         else importo_totale end
  ) stored,
  ricorrenza_id uuid references public.transazioni_ricorrenti (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (categoria_id, macrocategoria_id) references public.categorie (id, macrocategoria_id),
  foreign key (microcategoria_id, categoria_id) references public.microcategorie (id, categoria_id),
  check (not condivisa or tipo = 'spesa'),
  check (
    (condivisa and pagata_da is not null and persona_id is not null and percentuale_mia is not null)
    or (not condivisa and pagata_da is null and persona_id is null and percentuale_mia is null)
  ),
  -- idempotenza del job delle ricorrenze: una sola transazione per ricorrenza e data
  unique (ricorrenza_id, data)
);

-- ---------------------------------------------------------------------------
-- Pagamenti di saldo (rimborsi tra me e una persona)
-- ---------------------------------------------------------------------------

create table public.pagamenti_saldo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null default current_date,
  persona_id uuid not null references public.persone (id),
  importo numeric(14,2) not null check (importo > 0),
  direzione text not null check (direzione in ('ricevuto', 'pagato')),
  nota text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Asset (anagrafica)
-- ---------------------------------------------------------------------------

create table public.asset (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker_isin text not null check (length(trim(ticker_isin)) > 0),
  nome text not null check (length(trim(nome)) > 0),
  tipologia text not null check (tipologia in ('azione', 'etf', 'obbligazione')),
  aliquota_tassa numeric(5,2) not null check (aliquota_tassa in (12.5, 26)),
  quotazione text not null check (quotazione in ('percentuale', 'unitaria')),
  aggiornamento_automatico boolean not null default false,
  simbolo_fonte text,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, ticker_isin),
  -- le obbligazioni sono quotate in % del nominale, azioni ed ETF a prezzo unitario
  check ((tipologia = 'obbligazione') = (quotazione = 'percentuale')),
  check (not aggiornamento_automatico or simbolo_fonte is not null)
);

create table public.asset_esposizione_geografica (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id uuid not null references public.asset (id) on delete cascade,
  paese text not null check (length(trim(paese)) > 0),
  percentuale numeric(5,2) not null check (percentuale > 0 and percentuale <= 100),
  unique (asset_id, paese)
);

-- La somma delle percentuali di un asset deve essere 100 (oppure nessuna riga).
-- Il controllo è rinviato a fine transazione, così si possono inserire
-- tutte le righe di un asset insieme.
create function public.verifica_esposizione_geografica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_asset uuid;
  v_totale numeric;
begin
  foreach v_asset in array array[new.asset_id, old.asset_id] loop
    continue when v_asset is null;
    select coalesce(sum(percentuale), 0) into v_totale
    from public.asset_esposizione_geografica
    where asset_id = v_asset;
    if v_totale <> 0 and v_totale <> 100 then
      raise exception 'La somma delle percentuali geografiche deve essere 100%% (ora è %)', v_totale;
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger esposizione_somma_100
after insert or update or delete on public.asset_esposizione_geografica
deferrable initially deferred
for each row execute function public.verifica_esposizione_geografica();

-- ---------------------------------------------------------------------------
-- Operazioni di investimento (acquisti e vendite)
-- ---------------------------------------------------------------------------

create table public.operazioni_investimento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('acquisto', 'vendita')),
  asset_id uuid not null references public.asset (id),
  -- per le obbligazioni: valore nominale in euro
  quantita numeric(18,6) not null check (quantita > 0),
  -- per le obbligazioni: % del nominale
  prezzo numeric(18,6) not null check (prezzo > 0),
  spese numeric(14,2) not null default 0 check (spese >= 0),
  -- valori calcolati e salvati al momento della vendita
  plusvalore numeric(14,2),
  tasse numeric(14,2) check (tasse >= 0),
  liquidita_incassata numeric(14,2),
  created_at timestamptz not null default now(),
  check (
    (tipo = 'acquisto' and plusvalore is null and tasse is null and liquidita_incassata is null)
    or (tipo = 'vendita' and plusvalore is not null and tasse is not null and liquidita_incassata is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Prezzi storici (un solo prezzo per asset e data)
-- ---------------------------------------------------------------------------

create table public.prezzi_storici (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id uuid not null references public.asset (id) on delete cascade,
  data date not null,
  prezzo_chiusura numeric(18,6) not null check (prezzo_chiusura > 0),
  fonte text not null check (fonte in ('manuale', 'automatica')),
  created_at timestamptz not null default now(),
  unique (asset_id, data)
);

-- ---------------------------------------------------------------------------
-- Impostazioni (una riga per utente)
-- ---------------------------------------------------------------------------

create table public.impostazioni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  saldo_iniziale numeric(14,2) not null default 0,
  data_saldo_iniziale date not null default current_date,
  giorni_prezzo_vecchio_azioni integer not null default 7 check (giorni_prezzo_vecchio_azioni > 0),
  giorni_prezzo_vecchio_obbligazioni integer not null default 30 check (giorni_prezzo_vecchio_obbligazioni > 0),
  soglia_avviso_prezzo_pct numeric(5,2) not null default 20 check (soglia_avviso_prezzo_pct > 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indici sulle chiavi esterne e sulle colonne usate dalle policy
-- ---------------------------------------------------------------------------

create index on public.macrocategorie (user_id);
create index on public.categorie (user_id);
create index on public.categorie (macrocategoria_id);
create index on public.microcategorie (user_id);
create index on public.microcategorie (categoria_id);
create index on public.persone (user_id);
create index on public.transazioni_ricorrenti (user_id);
create index on public.transazioni_ricorrenti (macrocategoria_id);
create index on public.transazioni_ricorrenti (categoria_id, macrocategoria_id);
create index on public.transazioni_ricorrenti (microcategoria_id, categoria_id);
create index on public.transazioni_ricorrenti (persona_id);
create index on public.transazioni_ricorrenti (prossima_scadenza) where attiva;
create index on public.transazioni (user_id, data);
create index on public.transazioni (macrocategoria_id);
create index on public.transazioni (categoria_id, macrocategoria_id);
create index on public.transazioni (microcategoria_id, categoria_id);
create index on public.transazioni (persona_id);
create index on public.pagamenti_saldo (user_id);
create index on public.pagamenti_saldo (persona_id);
create index on public.asset_esposizione_geografica (user_id);
create index on public.operazioni_investimento (user_id, data);
create index on public.operazioni_investimento (asset_id, data);
create index on public.prezzi_storici (user_id);

-- ---------------------------------------------------------------------------
-- Permessi, RLS e policy: solo l'utente autenticato proprietario della riga
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'macrocategorie', 'categorie', 'microcategorie', 'persone',
    'transazioni_ricorrenti', 'transazioni', 'pagamenti_saldo',
    'asset', 'asset_esposizione_geografica', 'operazioni_investimento',
    'prezzi_storici', 'impostazioni'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Accesso solo al proprietario" on public.%I
         for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end;
$$;

revoke execute on function public.verifica_esposizione_geografica() from public, anon, authenticated;
