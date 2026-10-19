# CLAUDE.md

## Progetto

App personale (utente singolo, solo EUR, mobile-first, usabile anche da web) per tracciare spese e investimenti. Le specifiche complete sono in `SPEC.md`: seguile come riferimento e, se qualcosa non è chiaro o è in conflitto, chiedimi prima di decidere.

## Stack

- Frontend: React + Vite
- Backend: Supabase (database Postgres, Auth, Edge Function, `pg_cron`)
- Deploy: GitHub + Vercel

## Regole fisse

- RLS sempre attivo su ogni tabella dello schema `public`, con policy che consentono l'accesso solo all'utente autenticato.
- Nel frontend si usano solo l'URL del progetto e la anon key. La `service_role` key non va mai nel frontend né nel repository.
- Nessun segreto nel codice: le variabili d'ambiente stanno in `.env` (già nel `.gitignore`) e nelle impostazioni della piattaforma di deploy. Fornisci sempre un file `.env.example` senza valori reali.
- Importi in `numeric` (mai `float`), date in formato ISO.
- Modifiche al database solo tramite migrazioni versionate nel repository.
- Usa il progetto Supabase già esistente: non crearne uno nuovo e non confermare costi senza chiedermelo.

## Modo di lavorare

- Lavora a passi piccoli, seguendo l'ordine del punto 10 di `SPEC.md`.
- Prima di modificare il database o fare cambiamenti ampi, descrivimi cosa farai e aspetta la mia conferma.
- Un commit a ogni passo completato, con un messaggio chiaro.
- Alla fine di ogni passo dimmi come verificare che funzioni.
- Rispondi in italiano, con spiegazioni semplici: non do per scontate conoscenze tecniche.
