# SPEC: App personale per spese e investimenti

## 0\. Ruolo e obiettivo

Agisci come senior full-stack developer e product architect, esperto di Supabase, app mobile-first (web + mobile), app di financial tracking e integrazione con API finanziarie (Yahoo Finance).

Devi progettare e realizzare un'applicazione web per il tracciamento delle spese e degli investimenti personali, includendo: schema database, relazioni, logica applicativa, struttura delle schermate e best practice tecniche.

## 1\. Contesto generale e vincoli tecnici

* Utente singolo (non multi-tenant).
* Valuta unica: EUR (€).
* Mobile-first, utilizzabile anche da web.
* Backend: Supabase (connettore già attivo).
* Deploy: GitHub, con piattaforma di hosting da scegliere (es. Vercel o Netlify).
* Frontend: **React + Vite**
* Lingua dell'interfaccia: italiano.

### Regole tecniche fisse

* **Autenticazione:** Supabase Auth con un solo utente. Serve per proteggere i dati con RLS.
* **RLS:** attivo su ogni tabella dello schema `public`, con policy che consentono accesso solo all'utente autenticato.
* **Chiavi:** nel frontend si usano solo URL del progetto e anon key. La `service\_role` key non va mai nel frontend né nel repository. Le variabili d'ambiente stanno in `.env` (nel `.gitignore`) e nelle impostazioni della piattaforma di deploy.
* **Importi:** colonne `numeric(14,2)`, mai `float`. Per quantità e prezzi di asset usare precisione maggiore (es. `numeric(18,6)`).
* **Date:** formato ISO, tipo `date` (o `timestamptz` dove serve l'orario).
* **Modifiche al database:** vanno fatte come migrazioni versionate. Prima di ogni modifica, descrivere cosa si farà e attendere conferma.

## 2\. Struttura dell'app: 4 sezioni

1. Dashboard
2. Transazioni
3. Investimenti
4. Impostazioni

\---

## 3\. PRIMA SEZIONE: Dashboard

### 3.1 Patrimonio attuale

In cima alla dashboard, a caratteri grandi, si mostra il **patrimonio attuale**, che si aggiorna dinamicamente:

```
Patrimonio = Liquidità totale + Valore corrente investimenti − Debiti
```

Dove (vedi anche la sezione 7, regole di calcolo):

* **Liquidità totale** = saldo iniziale + entrate − uscite (quota personale) − acquisti asset (incluse spese) + vendite asset (al netto di spese e tasse) + eventuali rimborsi ricevuti − eventuali rimborsi pagati.
* **Valore corrente investimenti** = somma di (quantità posseduta × ultimo prezzo di chiusura disponibile).
* **Debiti** = saldo netto verso le persone con spese condivise (se negativo per me è un debito, se positivo è un credito che va sommato).

### 3.2 Spese

* Elenco e filtri delle spese per macrocategoria, categoria o microcategoria.
* Grafici delle spese dell'ultimo mese e dell'ultimo anno, con selettori per scegliere mese e anno.
* I grafici per categoria usano la **quota personale** della spesa (non l'importo totale delle spese condivise).

### 3.3 Tasso di risparmio

Indicatore percentuale del tasso di risparmio del mese, con selettori di mese e anno. Di default è impostato sul **mese precedente**.

```
Tasso di risparmio = ((Entrate del mese − Uscite del mese) / Entrate del mese) × 100
```

Se le entrate del mese sono zero, mostrare "n/d" invece di dividere per zero.

### 3.4 Debiti e crediti

Riepilogo dei debiti/crediti con le persone con cui ci sono spese divise, con saldo netto per persona e dettaglio delle spese che lo compongono.

### 3.5 Andamento investimenti

* Per ogni asset: quantità, prezzo medio di carico (PMC), ultimo prezzo di chiusura, valore attuale, guadagno/perdita in € e in %.
* Il prezzo è l'ultimo prezzo di chiusura disponibile (di norma quello della sera prima), preso da Yahoo Finance.
* Il PMC è calcolato dai record di inserimento degli investimenti (vedi sezione 7).

### 3.6 Aggiornamento prezzi

* Il metodo principale è l'**aggiornamento manuale**: il pulsante **"Aggiorna Prezzi"** apre una schermata con tutti gli asset posseduti, dove l'utente controlla e salva il prezzo di chiusura più recente.
* Per gli asset con una fonte automatica verificata (inizialmente solo VWCE, da testare) il prezzo viene scaricato **una sola volta al giorno**, dopo la chiusura dei mercati, tramite job programmato.
* La dashboard mostra sempre la data dell'ultimo prezzo di ogni asset.
* Dettagli nella sezione 6.2.

### 3.7 Esposizione geografica ponderata

Grafico dell'esposizione geografica dell'intero portafoglio. Per ogni paese:

```
Esposizione paese = Σ (valore attuale della posizione × % del paese in quell'asset) / valore totale portafoglio
```

\---

## 4\. SECONDA SEZIONE: Transazioni

### 4.1 Cronologia

Schermata con la cronologia di spese e incassi inseriti. Ogni voce si può modificare o eliminare. Un pulsante permette di aggiungere una nuova spesa/incasso.

### 4.2 Modulo di inserimento

Campi:

* **Tipo:** spesa o incasso.
* **Data:** impostata automaticamente sulla data odierna.
* **Importo.**
* **Nota descrittiva.**
* **Categoria:** gerarchia rigida a tre livelli (macrocategoria → categoria → microcategoria). Esempio: "Casa" → "Bollette" → "Energia elettrica".

### 4.3 Selezione della categoria (interfaccia anti-elenco infinito)

Non si usano normali menù a tendina, perché con molte categorie diventerebbero troppo lunghi. Si usa invece **un campo di testo con autocompletamento**:

* Mentre l'utente digita (es. "energia elettrica" o "casa"), l'elenco si filtra istantaneamente mostrando i **percorsi completi** che contengono il testo (es. "Casa > Bollette > Energia elettrica").
* Se il campo è vuoto, mostra l'elenco compresso con le sole macrocategorie, espandibili con un clic.

### 4.4 Compilazione automatica della gerarchia

L'utente può compilare uno qualsiasi dei tre livelli:

* Se seleziona solo la **microcategoria**, l'app risale la gerarchia e compila automaticamente categoria e macrocategoria.
* Se seleziona solo la **categoria**, l'app compila automaticamente la macrocategoria e rende selezionabili (ma non obbligatorie) solo le microcategorie di quella categoria.
* Se seleziona solo la **macrocategoria**, restano selezionabili le categorie figlie.
* La microcategoria è opzionale; la transazione si può salvare anche con solo macrocategoria e categoria.

### 4.5 Spesa condivisa

Checkbox **"Spesa condivisa"**. Se selezionata, mostra:

* **Chi ha pagato** (io o una persona).
* **Con chi dividere** (menù a tendina delle persone configurate in Impostazioni).
* **Percentuale di divisione** (default 50/50).

Regole di salvataggio:

* Si salva l'**importo totale** della spesa e, a parte, la **quota personale** (importo × la mia percentuale).
* Le statistiche per categoria usano la quota personale.
* Il saldo con la persona si ricava così:

  * se ho pagato io: l'altra persona mi deve la sua quota;
  * se ha pagato l'altra persona: io le devo la mia quota.
* Per estinguere un debito/credito si registra un **pagamento di saldo** (rimborso) con persona, data, importo e direzione (ricevuto/pagato). Il rimborso sposta la liquidità ma non è una spesa né un'entrata nelle statistiche e nel tasso di risparmio.

### 4.6 Spesa ricorrente

Checkbox **"Rendi spesa ricorrente"**. Se selezionata, mostra:

* **Prossima scadenza.**
* **Frequenza:** mensile, bimestrale, semestrale, annuale.
* **Fine ricorrenza** (data opzionale).

Al salvataggio, se la spunta è attiva:

* I dati vanno nella tabella `transazioni\_ricorrenti`.
* La **prima transazione viene inserita subito** nella tabella `transazioni`.

### 4.7 Elaborazione automatica delle ricorrenze

**Modifica rispetto alla bozza iniziale:** la logica non gira nel frontend con `setInterval`, perché funzionerebbe solo ad app aperta. Gira **lato Supabase**, con un job programmato (`pg\_cron` che richiama una funzione SQL o una Edge Function) **una volta al giorno**.

Per ogni riga attiva di `transazioni\_ricorrenti` con `prossima\_scadenza` ≤ data odierna:

1. Inserisce una nuova transazione reale in `transazioni` (con la data della scadenza, non quella odierna).
2. Calcola la scadenza successiva in base alla frequenza e aggiorna `prossima\_scadenza`.
3. Se la nuova scadenza supera `fine\_ricorrenza`, disattiva la ricorrenza (campo `attiva = false`, senza eliminare lo storico).

Requisiti:

* **Recupero dei ritardi:** se mancano più scadenze (es. 3 mesi di ritardo), il job le recupera tutte in un ciclo, generando una transazione per ciascuna.
* **Idempotenza:** eseguire il job due volte nello stesso giorno non deve creare duplicati.
* Se la ricorrenza è anche una spesa condivisa, le transazioni generate ereditano i dati di condivisione.
* Al primo avvio dell'app si può mostrare l'ultimo esito del job, ma l'app non è responsabile di eseguirlo.

\---

## 5\. TERZA SEZIONE: Investimenti

### 5.1 Cronologia

Schermata con la cronologia delle operazioni (acquisti e vendite), modificabili ed eliminabili. Due pulsanti: **Nuovo acquisto** e **Vendita**.

### 5.2 Acquisto

Campi:

* **Data** (default: oggi).
* **Asset** (menù a tendina degli asset salvati in Impostazioni).
* **Quantità** di azioni/obbligazioni/ETF.
* **Prezzo di carico** (prezzo unitario).
* **Spese dell'operazione** (opzionali).

### 5.3 Vendita (totale o parziale)

Campi:

* **Asset**, scelto tra quelli attualmente posseduti (quantità residua > 0). Mostrare la quantità disponibile.
* **Quantità venduta** (non può superare la quantità posseduta).
* **Data di vendita** (default: oggi).
* **Prezzo di vendita** (unitario).
* **Spese dell'operazione** (opzionali).

Calcoli automatici:

```
Valore venduto = quantità × prezzo di vendita
Valore di carico = quantità × PMC
Plusvalore = Valore venduto − Valore di carico − spese di vendita
Tasse = max(Plusvalore, 0) × aliquota dell'asset
Liquidità incassata = Valore venduto − spese di vendita − Tasse
```

* L'**aliquota** (12,5% o 26%) viene recuperata dall'anagrafica dell'asset.
* In caso di **minusvalenza** (plusvalore < 0), le tasse **non** vengono calcolate (tasse = 0).
* Il PMC applicato è quello al momento della vendita. Dopo una vendita parziale il PMC dell'asset resta invariato e cala solo la quantità.
* Plusvalore, tasse e liquidità incassata si salvano sulla riga della vendita, così lo storico non cambia se si modificano le regole in futuro.

\---

## 6\. Integrazioni e job

### 6.1 Job programmati (riepilogo)

|Job|Frequenza|Dove gira|
|-|-|-|
|Generazione transazioni ricorrenti|1 volta al giorno|Supabase (`pg\_cron`)|
|Download prezzi di chiusura (solo asset con fonte automatica verificata, opzionale)|1 volta al giorno, dopo la chiusura dei mercati|Supabase (`pg\_cron` + Edge Function)|

Nota: `pg\_cron` usa l'orario UTC; configurare gli orari tenendo conto del fuso Europe/Rome.

### 6.2 Aggiornamento prezzi (manuale come metodo principale)

**Principio:** nessuna fonte gratuita e affidabile copre con certezza tutti gli asset previsti (obbligazioni italiane del MOT ed ETF come VWCE). Per questo l'**inserimento manuale è il metodo principale**, mentre l'aggiornamento automatico è un'aggiunta opzionale, limitata agli asset per cui una fonte è stata verificata. L'app non deve mai dipendere da una fonte esterna per funzionare.

#### Aggiornamento manuale

* Il pulsante **"Aggiorna Prezzi"** (presente nella dashboard, nella parte investimenti, e nella sezione Investimenti) apre una schermata con **tutti gli asset attualmente posseduti** (quantità > 0).
* Per ogni asset la schermata mostra: nome, ticker/ISIN, **ultimo prezzo salvato con la sua data**, un campo per il **nuovo prezzo** e un campo per la **data del prezzo** (default: oggi).
* Il campo del nuovo prezzo mostra l'ultimo prezzo come suggerimento (segnaposto). Il salvataggio, con un unico pulsante, registra **solo le righe che l'utente ha compilato o modificato**, così i prezzi invariati non ricevono una data nuova che non corrisponde a una vera rilevazione.
* **Validazione:** il prezzo deve essere maggiore di zero. Se differisce dall'ultimo prezzo per più di una soglia (proposta: ±20%), mostrare un avviso di conferma (non un blocco) per intercettare errori di battitura, come virgola e punto scambiati.
* Il salvataggio crea o aggiorna il record in `prezzi\_storici` per quell'asset e data, con `fonte = 'manuale'`. Esiste un solo record per asset e data (vincolo di unicità): se già presente, viene sovrascritto.
* È possibile inserire il prezzo anche per una **data passata**, per correggere o completare lo storico.
* **Promemoria prezzi vecchi:** la dashboard mostra per ogni asset la data dell'ultimo prezzo e segnala con un'etichetta ("prezzo vecchio") quando supera una soglia configurabile in Impostazioni (proposta: 7 giorni per azioni ed ETF, 30 giorni per le obbligazioni).

#### Obbligazioni (prezzo in percentuale del nominale)

* Le obbligazioni sono quotate in **percentuale del valore nominale** (es. 100,59). In anagrafica ogni asset ha un campo `quotazione`: `percentuale` (obbligazioni) oppure `unitaria` (azioni ed ETF).
* Per le obbligazioni la **quantità è il valore nominale in euro** (es. 5.000) e il **valore attuale** è `nominale × prezzo / 100`.
* Il prezzo di carico di acquisti e vendite è espresso nello stesso modo (% del nominale). Costo di un acquisto = `nominale × prezzo / 100 + spese`. Il PMC resta in % del nominale (vedi sezione 7).
* Il prezzo usato è quello quotato **senza rateo di cedola** (corso secco). Le **cedole incassate** si registrano come entrate in una categoria dedicata.

#### Regole comuni

* La dashboard legge **solo** dalla tabella `prezzi\_storici` (asset, data, prezzo, fonte), usando per ogni asset il prezzo più recente con data ≤ oggi e mostrando la data.
* Se per un asset non esiste nessun prezzo, usare provvisoriamente il prezzo medio di carico (PMC) come valore e segnalarlo con l'etichetta "nessun prezzo disponibile".

\---

## 7\. Regole di calcolo (riferimento unico)

### Prezzo medio di carico (PMC)

Costo medio ponderato, calcolato dai record di acquisto:

```
PMC = Σ (quantità × prezzo di carico + spese di acquisto) / Σ quantità acquistata
```

* Le **spese di acquisto entrano nel costo** (quindi nel PMC).
* Dopo una vendita parziale il PMC resta invariato; cala solo la quantità posseduta.
* Se si modifica o elimina un'operazione passata, il PMC e le posizioni vanno ricalcolati in ordine cronologico, verificando che la quantità non diventi mai negativa.

### Liquidità

Acquisti e vendite di asset **muovono la liquidità**:

* Acquisto: − (quantità × prezzo + spese).
* Vendita: + (quantità × prezzo − spese − tasse).

### Spese e entrate

* Spese e entrate personali usano la quota personale.
* I rimborsi per saldare debiti spostano liquidità e saldo con la persona, ma non entrano nelle statistiche di spesa né nel tasso di risparmio.

### Obbligazioni

* Quotate in % del nominale: quantità = valore nominale in euro, valore attuale = `nominale × prezzo / 100`, costo di acquisto = `nominale × prezzo / 100 + spese`.
* Il PMC e il plusvalore delle vendite seguono le stesse formule della sezione 5, applicando il costo calcolato come sopra. Dettagli e cedole nella sezione 6.2.

### Valuta

Un'unica valuta (EUR). Se un asset è quotato in un'altra valuta, nella prima versione si assume l'inserimento manuale dei prezzi di carico in EUR e si segnala il limite sul prezzo di Yahoo. **\[DA CONFERMARE: asset solo in EUR o anche in altre valute?]**

\---

## 8\. QUARTA SEZIONE: Impostazioni

### 8.1 Gerarchia categorie

Gestione (creazione, modifica, eliminazione) di macrocategorie, categorie e microcategorie. Non si può eliminare una voce usata da transazioni; in alternativa va disattivata (archiviata).

### 8.2 Persone

Elenco delle persone che compaiono nel menù a tendina per la divisione delle spese.

### 8.3 Anagrafica asset

Per ogni asset:

* Ticker/ISIN.
* Tipo di quotazione: `percentuale` (obbligazioni, prezzo in % del nominale) oppure `unitaria` (azioni ed ETF).
* Aggiornamento automatico (sì/no) e, se sì, simbolo nel formato della fonte dati (vedi sezione 6.2).
* Nome.
* Tipologia: Azione, ETF, Obbligazione.
* Aliquota tassa: 12,5% o 26%.
* **Esposizione geografica:** percentuali per ogni paese. Controllo di validazione: la somma deve essere esattamente **100%**.

### 8.4 Saldo iniziale

Impostazione del saldo iniziale (con data di partenza) da cui parte il calcolo del patrimonio mostrato in dashboard.

### 8.5 Altre informazioni utili

Ogni altra impostazione utile all'inserimento di spese e investimenti nelle altre sezioni.

\---

## 9\. Schema database (proposta di partenza)

Tabelle principali, tutte con RLS attivo:

* `macrocategorie` (id, nome, attiva)
* `categorie` (id, macrocategoria\_id, nome, attiva)
* `microcategorie` (id, categoria\_id, nome, attiva)
* `persone` (id, nome, attiva)
* `transazioni` (id, data, tipo, importo\_totale, quota\_personale, nota, macrocategoria\_id, categoria\_id, microcategoria\_id, condivisa, pagata\_da, persona\_id, percentuale\_mia, ricorrenza\_id)
* `transazioni\_ricorrenti` (id, dati della transazione modello, frequenza, prossima\_scadenza, fine\_ricorrenza, attiva)
* `pagamenti\_saldo` (id, data, persona\_id, importo, direzione, nota)
* `asset` (id, ticker\_isin, nome, tipologia, aliquota\_tassa, quotazione, aggiornamento\_automatico, simbolo\_fonte)
* `asset\_esposizione\_geografica` (id, asset\_id, paese, percentuale)
* `operazioni\_investimento` (id, data, tipo acquisto/vendita, asset\_id, quantita, prezzo, spese, e per le vendite: plusvalore, tasse, liquidita\_incassata)
* `prezzi\_storici` (id, asset\_id, data, prezzo\_chiusura, fonte; unico per asset e data)
* `impostazioni` (id, saldo\_iniziale, data\_saldo\_iniziale, altre impostazioni)

Vincoli da prevedere:

* Coerenza della gerarchia (la categoria appartiene alla macrocategoria indicata, la microcategoria alla categoria).
* Percentuali di condivisione tra 0 e 100.
* Importi e quantità maggiori di zero dove ha senso.
* Somma delle percentuali geografiche di un asset uguale a 100.

Per i calcoli ripetuti (posizioni, PMC, saldi per persona, esposizione) valutare **viste SQL** o funzioni, in modo che la logica stia in un solo posto.

\---

## 10\. Ordine di sviluppo

1. Schema database: tabelle, vincoli, RLS e policy (con migrazioni versionate).
2. Autenticazione e sezione Impostazioni (categorie, persone, asset, saldo iniziale).
3. Transazioni: form con autocompletamento categorie, spese condivise, spese ricorrenti.
4. Job delle ricorrenze (`pg\_cron`).
5. Investimenti: acquisti e vendite, calcolo PMC e tasse; poi prezzi giornalieri (Edge Function + `pg\_cron` + pulsante "Aggiorna Prezzi").
6. Dashboard: patrimonio, spese e grafici, tasso di risparmio, debiti/crediti, investimenti, esposizione geografica.
7. Deploy da GitHub e verifica finale (RLS, variabili d'ambiente, nessun segreto nel repo).

Si procede a passi piccoli, con un commit su GitHub a ogni passo completato.

\---

