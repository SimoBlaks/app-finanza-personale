# CLAUDE.md

## Progetto

App personale (utente singolo, solo EUR, mobile-first, usabile anche da web) per tracciare spese e investimenti. Le specifiche complete sono in `SPEC.md`: seguile come riferimento e, se qualcosa non è chiaro o è in conflitto, chiedimi prima di decidere.

**Leggi anche `DECISIONI.md` prima di ogni modifica**: contiene le scelte prese durante lo sviluppo, che completano o cambiano `SPEC.md` (es. categoria facoltativa, prezzi solo manuali, regola della liquidità, pubblicazione su GitHub Pages). Aggiungici ogni nuova decisione concordata.

## Stato

I 7 passi del punto 10 di `SPEC.md` sono completati e l'app è online su https://simoblaks.github.io/app-finanza-personale/. Da qui in poi si lavora per singole modifiche richieste.

## Stack

- Frontend: React + Vite (`src/`), indirizzi con `#` (HashRouter)
- Backend: Supabase, progetto esistente "Personal Finance Project" (id `kdvwxqzaoxsehpeylino`): database Postgres, Auth, `pg_cron`
- Deploy: GitHub Pages. A ogni push su `main` l'automazione `.github/workflows/pubblica.yml` compila e pubblica l'app; URL e chiave pubblica di Supabase stanno nei secrets del repository. Il repository è pubblico.

## Regole fisse

- RLS sempre attivo su ogni tabella dello schema `public`, con policy che consentono l'accesso solo all'utente autenticato.
- Nel frontend si usano solo l'URL del progetto e la anon key. La `service_role` key non va mai nel frontend né nel repository.
- Nessun segreto nel codice: le variabili d'ambiente stanno in `.env` (già nel `.gitignore`) e nei secrets di GitHub. Fornisci sempre un file `.env.example` senza valori reali.
- Importi in `numeric` (mai `float`), date in formato ISO.
- Modifiche al database solo tramite migrazioni versionate nel repository (`supabase/migrations/`).
- Usa il progetto Supabase già esistente: non crearne uno nuovo e non confermare costi senza chiedermelo.

## Modo di lavorare

- Lavora a passi piccoli.
- Prima di modificare il database o fare cambiamenti ampi, descrivimi cosa farai e aspetta la mia conferma.
- Fammi provare le modifiche in locale prima di pubblicarle; un commit per ogni modifica completata, con un messaggio chiaro.
- Alla fine di ogni passo dimmi come verificare che funzioni.
- Rispondi in italiano, con spiegazioni semplici: non do per scontate conoscenze tecniche.

## Note pratiche per lo sviluppo

- Avvio in locale: `npm run dev` (http://localhost:5173). Su questo PC il server di Vite a volte tiene in memoria una versione vecchia dei file dopo molte modifiche ravvicinate: se la pagina non corrisponde al codice, riavvialo con `npm run dev -- --force`.
- Commit con l'email anonima di GitHub (già impostata nel repository). Il push va fatto da un terminale interattivo, dove sono salvate le credenziali di GitHub.
- Migrazioni: salva il file in `supabase/migrations/` e applicalo al progetto Supabase. Prova i cambiamenti con blocchi SQL che finiscono con un errore voluto, così tutti i dati di prova vengono annullati; non lasciare dati di prova nel database.
- La logica di calcolo sta nel database: PMC, vendite e posizioni (trigger su `operazioni_investimento` e vista `posizioni`), liquidità e saldi con le persone (viste `liquidita` e `saldi_persone`), ricorrenze (job `genera-ricorrenze` nello schema `privato`).
- Le funzioni nello schema `privato` non sono richiamabili dall'utente dell'app: un trigger che gira come utente autenticato non può chiamarle.
- Per le conferme usa `useConferma()` (`src/components/Conferma.jsx`), non `window.confirm`, che in alcuni browser non si mostra.
- Gli importi verso il database si passano come stringhe (`leggiNumero` in `src/lib/numeri.js`); i grafici sono a serie singola nel colore primario (`src/components/grafici/`).
