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

## 2026-10-19 · Importazione dello storico da Excel (2013 → 30/06/2026)

- Importati 3.174 movimenti dal file "Entrate_Uscite" (fogli annuali), fino al 30/06/2026 (data fino alla quale i conti con le persone erano in pari). Saldo iniziale 0 € dal 01/01/2013.
- Spese divise a metà: importata solo la propria quota (risultato della formula), come spesa normale; la nota riporta il totale ("divisa a metà: totale …"). Importi con mezzo centesimo arrotondati al centesimo.
- Esclusa la macrocategoria "Investimenti" (PAC, pensione complementare, cedole): gli investimenti si gestiscono nella sezione Investimenti.
- Nomi uniformati (trattini bassi → spazi, "lavoro"/"acqua"/"Bollo"/"Cruncyroll" corretti); i prelievi senza categoria in "Speciale > Non classificabile".
- I dati personali non sono nel repository: l'importazione è avvenuta direttamente nel database e i file Excel/CSV sono esclusi da git.

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

## 2026-10-19 · Dividendi e cedole

- Si registrano nella pagina Investimenti ("Dividendo / cedola") nella tabella `proventi_investimento`: asset, tipo (dividendo o cedola), data di incasso, **importo lordo e tasse**; il netto lo calcola il database. Le tasse si propongono con l'aliquota dell'asset e si possono correggere.
- Il netto **aumenta la liquidità** (viste `liquidita` e `riepilogo_mensile`) e quindi il patrimonio, ma **non conta tra le entrate** né nel tasso di risparmio.
- Non toccano il PMC. Nella scheda di una posizione compaiono il totale netto incassato e il "guadagno con proventi".
- Nell'export Excel stanno nel foglio "Investimenti", con la colonna "Provento lordo".
- Le cedole passate del file Excel non vengono importate.

## 2026-10-20 · Importazione dal file Excel (01/07/2026 → 30/10/2026)

- Importati 115 movimenti dal foglio 2026 del file "Entrate_Uscite" aggiornato, con le stesse regole dello storico: spese divise inserite con la sola quota personale e il totale nella nota (una spesa divisa per 2,5: quota 40%).
- Esclusi gli interessi del conto (macrocategoria "Investimenti" del file), come per lo storico.
- Create le microcategorie mancanti "Dentista" (Spese mediche › Visite mediche) e "Provvigioni" (sotto Lavoro).
- Una riga con formula rotta nel file è stata inserita con l'importo confermato a voce; due righe con data futura entrano nella liquidità solo alla loro data.

## 2026-10-20 · Rettifiche di liquidità

- Tabella `rettifiche_liquidita` (data, importo con segno, nota): allinea la liquidità dell'app al saldo reale dei conti quando c'è una differenza che non si riesce a ricostruire.
- Si registra da Impostazioni › Saldo e soglie: si scrive il saldo reale di oggi e l'app registra la differenza con la data di oggi.
- Conta nella liquidità (viste `liquidita` e `riepilogo_mensile`) e quindi nel patrimonio, ma non è né una spesa né un'entrata: statistiche e tasso di risparmio non cambiano. Nell'export compare nel foglio "Rettifiche".

## 2026-10-20 · Fondi pensione e asset esclusi dal patrimonio

- Ogni acquisto o vendita di un investimento ha l'interruttore **"Pagato dalla liquidità" / "Incassato nella liquidità"** (campo `movimenta_liquidita`, attivo di default). Spento, l'operazione cambia la posizione (quote, PMC) ma non tocca la liquidità e non è né spesa né entrata: serve per il TFR o i contributi versati dal datore di lavoro e per i trasferimenti tra fondi.
- Ogni asset ha l'interruttore **"Escludi dal patrimonio"** (campo `escluso_dal_patrimonio`): l'asset resta visibile in Investimenti e in dashboard con l'etichetta "escluso dal patrimonio", ma non entra nei totali di patrimonio, investimenti ed esposizione geografica.
- Nell'export il foglio "Investimenti" ha la colonna "Movimenta la liquidità".
- Tra le tipologie di asset c'è anche **"Fondo"** (es. fondo pensione), quotato a prezzo unitario come azioni ed ETF.

## 2026-10-20 · Piani di accumulo (PAC) ricorrenti

- In Investimenti › Piani di accumulo: nome, frequenza (come le ricorrenze), prossima scadenza, fine facoltativa, interruttore "Pagato dalla liquidità" (spento per il TFR) e una o più righe con asset, **importo fisso** o **quantità fissa**, prezzo di riferimento e spese.
- Il job notturno delle ricorrenze crea a ogni scadenza un acquisto per riga (tabelle `piani_accumulo` e `piani_accumulo_righe`; sulle operazioni `piano_id` e `da_verificare`). Il prezzo è **stimato**: ultimo prezzo inserito fino a quella data, altrimenti PMC, altrimenti prezzo di riferimento della riga. Con l'importo fisso la quantità è importo ÷ prezzo stimato.
- Gli acquisti generati sono segnati **"da verificare"**: l'app lo segnala in Investimenti; aprendo l'acquisto e salvandolo con i dati reali del broker l'etichetta sparisce.
- Scadenze passate al momento della creazione vengono recuperate la notte successiva; riattivando un piano sospeso si riparte invece dalla prima scadenza da oggi in poi. Eliminare un piano non cancella gli acquisti già creati.

## 2026-10-21 · Transazioni: tabella, filtri e grafica

- I movimenti con data successiva a oggi hanno il bordo arancione e l'etichetta **"programmata"** (cronologia ed elenco della dashboard).
- In Transazioni l'interruttore **Elenco / Tabella** sceglie la vista; la scelta resta salvata sul dispositivo. La tabella ha le colonne Data, Descrizione, Categoria, Persona, Totale e Tua quota, ordinabili per data e importi (l'elenco resta sempre per data).
- Filtri aggiunti: "Future", "Ricorrenti", persona (spese condivise e rimborsi) e **più categorie insieme** a qualsiasi livello; una voce scelta comprende le sue interne, una scelta parziale si vede con il trattino.
- Chiudendo una registrazione aperta dall'elenco si torna nello stesso punto, con le righe già caricate.
- Il menu (laterale su schermi larghi, in basso sul telefono) è colorato; su schermi larghi si può ridurre alle sole icone, scelta salvata sul dispositivo.
- Con qualsiasi filtro attivo compaiono i totali (tua quota) di entrate e uscite di tutti i movimenti trovati, più i rimborsi ricevuti e pagati se presenti.

## 2026-10-21 · Scorciatoie di categoria

- In Impostazioni › Scorciatoie si creano pulsanti con tipo (Pagamento o Incasso), percorso macro › categoria › micro, nome facoltativo (altrimenti quello della voce più interna), nota facoltativa e ordine (tabella `scorciatoie_categoria`, salvata nel database: uguale su tutti i dispositivi).
- I pulsanti compaiono in cima alla schermata di una **nuova** transazione: un tocco imposta tipo, categoria e nota. La nota della scorciatoia sostituisce solo una nota vuota o arrivata da un'altra scorciatoia, mai un testo scritto a mano.
- Una scorciatoia con una categoria archiviata non compare nella registrazione; eliminando la categoria si elimina anche la scorciatoia.
- Nella schermata di registrazione il tipo "Spesa" si chiama **"Pagamento"**, per non confonderlo con una scorciatoia della spesa al supermercato.

## 2026-10-22 · Dashboard: patrimonio nel tempo e nuova disposizione

- Al posto della liquidità nel tempo c'è il **patrimonio nel tempo**, mese per mese (anche nel riquadro in alto: grafico piccolo e variazione degli ultimi 12 mesi). Ogni punto = liquidità a fine mese + investimenti + crediti − debiti; il mese in corso si chiude a oggi, così l'ultimo punto coincide con il patrimonio attuale.
- Investimenti nel passato: quantità posseduta a fine mese × **ultimo prezzo inserito** fino a quella data; se per l'asset non c'è ancora un prezzo, si usa il PMC (costo di acquisto). Gli asset esclusi dal patrimonio non contano. Più prezzi storici si inseriscono, più il grafico è fedele.
- Nuova ciambella **"Investito per strumento"** (azioni, ETF, obbligazioni, fondi) sul valore attuale.
- Tolte dalla dashboard le schede delle singole posizioni (restano in Investimenti) e l'elenco delle spese sotto il grafico.
- Ordine: patrimonio, poi spese/entrate, tasso di risparmio, entrate e uscite; su schermi larghi questi stanno a sinistra e patrimonio nel tempo, debiti/crediti e investimenti a destra.
- In Transazioni si caricano 30 movimenti alla volta; le entrate programmate (incassi e rimborsi ricevuti) hanno il bordo blu, le uscite arancione.
