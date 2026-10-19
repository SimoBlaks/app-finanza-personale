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

## 2026-10-19 · Liquidità e spese condivise (da applicare al passo 6)

La formula della SPEC sottrae dalla liquidità la quota personale e in più conta i debiti: per una spesa pagata da un'altra persona il patrimonio scenderebbe due volte.

Regola adottata:

- **Liquidità**: si muove di quello che è uscito o entrato davvero dal conto. Spesa condivisa pagata da me: − importo totale. Pagata dall'altra persona: 0.
- **Debiti/crediti**: se ho pagato io, l'altra persona mi deve la sua quota (credito); se ha pagato lei, le devo la mia (debito). I rimborsi spostano liquidità e saldo con la persona.
- **Statistiche per categoria e tasso di risparmio**: usano la quota personale, come da SPEC.

Così `Patrimonio = Liquidità + Investimenti + Crediti − Debiti` è corretto in tutti i casi.
