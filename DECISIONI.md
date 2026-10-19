# Decisioni prese durante lo sviluppo

Scelte che completano o correggono `SPEC.md`, concordate prima di implementarle.

## 2026-10-19 · Sicurezza dei dati (RLS)

Ogni tabella ha una colonna `user_id` (compilata in automatico con l'utente che fa l'accesso) e le policy RLS consentono lettura e scrittura solo al proprietario della riga. Le registrazioni di nuovi utenti vanno disattivate in Supabase.

## 2026-10-19 · Valuta

Solo EUR.

## 2026-10-19 · Categoria facoltativa (modifica SPEC 4.4)

Nelle transazioni (e ricorrenze) è obbligatoria solo la **macrocategoria**; categoria e microcategoria sono facoltative. La microcategoria si può indicare solo insieme alla sua categoria, e la gerarchia resta sempre coerente.

## 2026-10-19 · Job delle ricorrenze

- Gira ogni giorno alle 04:00 UTC (`pg_cron`) e usa la data italiana (Europe/Rome).
- Ogni ricorrenza ha un `giorno_riferimento` (il giorno della prima scadenza): una scadenza al 31 cade il 28/29 a febbraio e torna al 31 a marzo.
- L'esito di ogni esecuzione va in `esecuzioni_job`. È l'unica tabella senza `user_id`: riguarda il sistema, non i dati personali; RLS attivo, l'utente autenticato la può solo leggere.
- Le funzioni del job stanno nello schema `privato`, non esposto dalle API.

## 2026-10-19 · PMC e vendite (passo 5a)

- **PMC a media progressiva**: le operazioni di un asset si ripercorrono in ordine cronologico (a parità di data, prima gli acquisti). Gli acquisti aggiungono quantità × prezzo + spese al costo di carico; una vendita toglie quantità × PMC, quindi il PMC resta invariato. Coincide con la formula della SPEC (punto 7) quando non ci sono vendite intermedie.
- Plusvalore, tasse e liquidità incassata li calcola il database e li salva sulla vendita. Correggere un'operazione passata ricalcola le successive; se la quantità diventerebbe negativa la modifica è rifiutata.
- Ogni vendita conserva l'**aliquota applicata**: cambiare l'aliquota di un asset non modifica le vendite già registrate.

## 2026-10-19 · Prezzi solo manuali (modifica SPEC 3.6 e 6.2)

Nessun aggiornamento automatico dei prezzi (niente Edge Function né job per Yahoo Finance): i prezzi di chiusura si inseriscono solo a mano con "Aggiorna Prezzi".

## 2026-10-19 · Pubblicazione su GitHub Pages (al posto di Vercel)

- L'app si pubblica con GitHub Pages; il repository è pubblico (nessun segreto nel codice né nella cronologia, verificato).
- A ogni push su `main` l'automazione `.github/workflows/pubblica.yml` compila e pubblica l'app. URL e chiave pubblica di Supabase stanno nei secrets del repository.
- Indirizzi con `#` (es. `/#/transazioni`), perché Pages non sa servire le pagine interne di un'app React; build con percorsi relativi (`base: './'`).
- Le nuove registrazioni su Supabase vanno disattivate: con il repository pubblico l'indirizzo del progetto è noto.

## 2026-10-19 · Liquidità e spese condivise (da applicare al passo 6)

La formula della SPEC sottrae dalla liquidità la quota personale e in più conta i debiti: per una spesa pagata da un'altra persona il patrimonio scenderebbe due volte.

Regola adottata:

- **Liquidità**: si muove di quello che è uscito o entrato davvero dal conto. Spesa condivisa pagata da me: − importo totale. Pagata dall'altra persona: 0.
- **Debiti/crediti**: se ho pagato io, l'altra persona mi deve la sua quota (credito); se ha pagato lei, le devo la mia (debito). I rimborsi spostano liquidità e saldo con la persona.
- **Statistiche per categoria e tasso di risparmio**: usano la quota personale, come da SPEC.

Così `Patrimonio = Liquidità + Investimenti + Crediti − Debiti` è corretto in tutti i casi.

Applicata al passo 6 con le viste `liquidita` e `saldi_persone`:

- la liquidità conta i movimenti **dalla data del saldo iniziale fino a oggi** (quelli precedenti sono già nel saldo iniziale, quelli futuri non sono ancora avvenuti); acquisti di asset: − (valore + spese), vendite: + liquidità incassata;
- i saldi con le persone contano tutte le spese condivise e i rimborsi fino a oggi, a prescindere dalla data del saldo iniziale.
