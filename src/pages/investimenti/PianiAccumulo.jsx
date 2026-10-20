import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { useConferma } from '../../components/Conferma'
import { euro, leggiNumero, numero, oggiISO, perCampo } from '../../lib/numeri'
import { dataBreve, frequenze } from '../../lib/date'
import { etichettaPrezzo, fattore, mostraPrezzo } from '../../lib/investimenti'

// Piani di accumulo (PAC): a ogni scadenza il job notturno crea un acquisto per riga,
// con prezzo stimato e l'etichetta "da verificare" (vedi DECISIONI.md).

// Prima scadenza da oggi in poi, con le stesse regole del database
// (giorno di riferimento; se il mese è più corto, l'ultimo giorno del mese).
function prossimaDaOggi(p) {
  const oggi = oggiISO()
  let [a, m] = p.prossima_scadenza.split('-').map(Number)
  const passo = frequenze[p.frequenza].mesi
  const data = () => {
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
    return `${a}-${String(m).padStart(2, '0')}-${String(Math.min(p.giorno_riferimento, ultimo)).padStart(2, '0')}`
  }
  while (data() < oggi) {
    m += passo
    while (m > 12) { m -= 12; a += 1 }
  }
  return data()
}

const rigaVuota = { asset_id: '', modalita: 'importo', valore: '', prezzo_riferimento: '', spese: '' }

// Prezzo proposto per una riga: ultimo prezzo inserito, altrimenti PMC della posizione.
const prezzoProposto = (assetId, ultimi, posizioni) => {
  const u = ultimi[assetId]?.prezzo_chiusura
  const pmc = posizioni.find((p) => p.asset_id === assetId && Number(p.quantita) > 0)?.pmc
  return u ?? pmc ?? null
}

export function ModuloPiano({ piano, righe, asset, ultimi, posizioni, onFine }) {
  const [f, setF] = useState({
    nome: piano?.nome ?? '',
    frequenza: piano?.frequenza ?? 'mensile',
    prossima_scadenza: piano?.prossima_scadenza ?? oggiISO(),
    fine_piano: piano?.fine_piano ?? '',
    movimenta_liquidita: piano ? piano.movimenta_liquidita : true,
    righe: righe?.length
      ? righe.map((r) => ({
          asset_id: r.asset_id,
          modalita: r.modalita,
          valore: perCampo(r.modalita === 'importo' ? r.importo : r.quantita),
          prezzo_riferimento: perCampo(r.prezzo_riferimento),
          spese: Number(r.spese) ? perCampo(r.spese) : '',
        }))
      : [rigaVuota],
  })
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const conferma = useConferma()
  const imposta = (campo, valore) => setF((x) => ({ ...x, [campo]: valore }))
  const impostaRiga = (i, campo, valore) =>
    setF((x) => ({ ...x, righe: x.righe.map((r, j) => (j === i ? { ...r, [campo]: valore } : r)) }))

  function scegliAsset(i, id) {
    const proposto = prezzoProposto(id, ultimi, posizioni)
    setF((x) => ({
      ...x,
      righe: x.righe.map((r, j) => (j === i ? { ...r, asset_id: id, prezzo_riferimento: r.prezzo_riferimento || (proposto ? perCampo(proposto) : '') } : r)),
    }))
  }

  const perId = Object.fromEntries(asset.map((a) => [a.id, a]))
  const scelte = asset.filter((a) => a.attivo || f.righe.some((r) => r.asset_id === a.id))

  // importo stimato di ogni scadenza (per le righe a quantità fissa con il prezzo di riferimento)
  const stimaRiga = (r) => {
    const v = leggiNumero(r.valore)
    const p = leggiNumero(r.prezzo_riferimento)
    const s = Number(leggiNumero(r.spese) ?? 0)
    if (!v) return 0
    return (r.modalita === 'importo' ? Number(v) : p ? Number(v) * Number(p) * fattore(perId[r.asset_id]) : 0) + s
  }
  const totale = f.righe.reduce((t, r) => t + stimaRiga(r), 0)

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    if (!f.nome.trim()) return setErrore('Dai un nome al piano.')
    if (!f.prossima_scadenza) return setErrore('Indica la data della prossima scadenza.')
    if (f.fine_piano && f.fine_piano < f.prossima_scadenza) return setErrore('La fine del piano è prima della prossima scadenza.')
    if (!f.righe.length) return setErrore('Aggiungi almeno un asset.')
    const righeDb = []
    for (const r of f.righe) {
      const a = perId[r.asset_id]
      if (!a) return setErrore('Scegli l\'asset in ogni riga.')
      if (righeDb.some((x) => x.asset_id === r.asset_id)) return setErrore(`${a.nome} compare due volte.`)
      const v = leggiNumero(r.valore)
      const p = leggiNumero(r.prezzo_riferimento)
      const s = leggiNumero(r.spese || '0')
      if (!v || Number(v) <= 0) return setErrore(`${a.nome}: ${r.modalita === 'importo' ? 'importo' : 'quantità'} non valido.`)
      if (!p || Number(p) <= 0) return setErrore(`${a.nome}: indica un prezzo di riferimento.`)
      if (s === null || Number(s) < 0) return setErrore(`${a.nome}: spese non valide.`)
      righeDb.push({
        asset_id: r.asset_id,
        modalita: r.modalita,
        importo: r.modalita === 'importo' ? v : null,
        quantita: r.modalita === 'quantita' ? v : null,
        prezzo_riferimento: p,
        spese: s,
      })
    }

    const dati = {
      nome: f.nome.trim(),
      frequenza: f.frequenza,
      prossima_scadenza: f.prossima_scadenza,
      // il giorno di riferimento segue la data scelta (scadenze al 31 → ultimo giorno del mese)
      giorno_riferimento: Number(f.prossima_scadenza.slice(8, 10)),
      fine_piano: f.fine_piano || null,
      movimenta_liquidita: f.movimenta_liquidita,
      attivo: true,
    }
    setInvio(true)
    const risposta = piano
      ? await supabase.from('piani_accumulo').update(dati).eq('id', piano.id).select('id').single()
      : await supabase.from('piani_accumulo').insert(dati).select('id').single()
    if (risposta.error) {
      setInvio(false)
      return setErrore(messaggioErrore(risposta.error))
    }
    const id = risposta.data.id
    // le righe si sostituiscono tutte: gli acquisti già creati non cambiano
    const via = await supabase.from('piani_accumulo_righe').delete().eq('piano_id', id)
    const dentro = via.error ? via : await supabase.from('piani_accumulo_righe').insert(righeDb.map((r) => ({ ...r, piano_id: id })))
    setInvio(false)
    if (dentro.error) return setErrore(messaggioErrore(dentro.error))
    onFine()
  }

  async function elimina() {
    if (!(await conferma({ titolo: `Eliminare il piano "${piano.nome}"?`, messaggio: 'Gli acquisti già creati restano.', conferma: 'Elimina', pericolo: true }))) return
    const { error } = await supabase.from('piani_accumulo').delete().eq('id', piano.id)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>{piano ? 'Modifica piano di accumulo' : 'Nuovo piano di accumulo'}</h2>
      <div className="griglia">
        <label>Nome<input value={f.nome} placeholder="es. PAC Vanguard, TFR fondo pensione" onChange={(e) => imposta('nome', e.target.value)} /></label>
        <label>
          Frequenza
          <select value={f.frequenza} onChange={(e) => imposta('frequenza', e.target.value)}>
            {Object.entries(frequenze).map(([k, v]) => <option key={k} value={k}>{v.etichetta}</option>)}
          </select>
        </label>
        <label>Prossima scadenza<input type="date" value={f.prossima_scadenza} onChange={(e) => imposta('prossima_scadenza', e.target.value)} /></label>
        <label>Fine del piano (facoltativa)<input type="date" value={f.fine_piano} onChange={(e) => imposta('fine_piano', e.target.value)} /></label>
      </div>
      <label className="interruttore-cifre">
        <input type="checkbox" role="switch" checked={f.movimenta_liquidita} onChange={(e) => imposta('movimenta_liquidita', e.target.checked)} />
        <span className="levetta" aria-hidden="true" />
        <span>Pagato dalla liquidità</span>
      </label>
      <p className="nota">Togli la spunta per i versamenti che non escono dal tuo conto, come il TFR versato dal datore di lavoro.</p>

      <h3>Asset del piano</h3>
      {f.righe.map((r, i) => {
        const a = perId[r.asset_id]
        return (
          <div key={i} className="riga-piano">
            <div className="griglia">
              <label>
                Asset
                <select value={r.asset_id} onChange={(e) => scegliAsset(i, e.target.value)}>
                  <option value="">Scegli…</option>
                  {scelte.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </label>
              <label>
                Modalità
                <select value={r.modalita} onChange={(e) => impostaRiga(i, 'modalita', e.target.value)}>
                  <option value="importo">Importo fisso (€)</option>
                  <option value="quantita">Quantità fissa</option>
                </select>
              </label>
              <label>
                {r.modalita === 'importo' ? 'Importo a ogni scadenza (€)' : a?.quotazione === 'percentuale' ? 'Nominale a ogni scadenza (€)' : 'Quantità a ogni scadenza'}
                <input inputMode="decimal" value={r.valore} onChange={(e) => impostaRiga(i, 'valore', e.target.value)} />
              </label>
              <label>
                {etichettaPrezzo(a)} di riferimento
                <input inputMode="decimal" value={r.prezzo_riferimento} onChange={(e) => impostaRiga(i, 'prezzo_riferimento', e.target.value)} />
              </label>
              <label>Spese a ogni acquisto (€, facoltative)<input inputMode="decimal" value={r.spese} onChange={(e) => impostaRiga(i, 'spese', e.target.value)} /></label>
            </div>
            {f.righe.length > 1 && (
              <button type="button" className="piccolo" onClick={() => setF((x) => ({ ...x, righe: x.righe.filter((_, j) => j !== i) }))}>Togli questo asset</button>
            )}
          </div>
        )
      })}
      <button type="button" className="piccolo" onClick={() => setF((x) => ({ ...x, righe: [...x.righe, rigaVuota] }))}>+ Asset</button>
      <p className="nota">
        Il prezzo di riferimento serve solo se l'asset non ha ancora prezzi né acquisti: di solito l'app usa l'ultimo prezzo che hai inserito.
        A ogni scadenza l'acquisto viene creato con il prezzo stimato e segnato <strong>"da verificare"</strong>: quando hai i dati reali del broker, aprilo e correggi quantità e prezzo.
      </p>
      {totale > 0 && <p className="nota">Circa <strong>{euro(totale)}</strong> a ogni scadenza{!f.movimenta_liquidita && ' (non tolti dalla liquidità)'}.</p>}

      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        {piano && <button type="button" className="pericolo" onClick={elimina}>Elimina</button>}
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}

export function ElencoPiani({ piani, righe, asset, onApri, onCambia }) {
  const [errore, setErrore] = useState('')
  const perId = Object.fromEntries(asset.map((a) => [a.id, a]))

  async function attiva(p) {
    setErrore('')
    const dati = { attivo: !p.attivo }
    // riattivando un piano sospeso, le scadenze saltate non vengono recuperate:
    // si riparte dalla prima scadenza da oggi in poi
    if (!p.attivo && p.prossima_scadenza < oggiISO()) dati.prossima_scadenza = prossimaDaOggi(p)
    const { error } = await supabase.from('piani_accumulo').update(dati).eq('id', p.id)
    if (error) return setErrore(messaggioErrore(error))
    onCambia()
  }

  return (
    <>
      <div className="intestazione-scheda">
        <h2>Piani di accumulo</h2>
        <button className="piccolo" onClick={() => onApri(null)} disabled={!asset.length}>+ Nuovo piano</button>
      </div>
      {errore && <p className="errore">{errore}</p>}
      {!piani.length && (
        <p className="nota">Nessun piano. Un piano crea in automatico, a ogni scadenza, gli acquisti dei suoi asset (es. PAC mensile o versamenti del TFR).</p>
      )}
      {piani.length > 0 && (
        <div className="scheda elenco-movimenti">
          {piani.map((p) => {
            const sue = righe.filter((r) => r.piano_id === p.id)
            return (
              <div key={p.id} className={`movimento statico ${p.attivo ? '' : 'archiviata'}`}>
                <span className="movimento-testo">
                  <strong>{p.nome}</strong>
                  <span className="nota">
                    {frequenze[p.frequenza].etichetta}
                    {p.attivo ? ` · prossima ${dataBreve(p.prossima_scadenza)}` : ''}
                    {p.fine_piano && ` · fino al ${dataBreve(p.fine_piano)}`}
                    {!p.movimenta_liquidita && ' · fuori liquidità'}
                    {!p.attivo && <span className="etichetta">sospeso</span>}
                  </span>
                  <span className="nota">
                    {sue.map((r) => `${perId[r.asset_id]?.nome ?? '?'}: ${r.modalita === 'importo' ? euro(r.importo) : `${numero(r.quantita)} ${perId[r.asset_id]?.quotazione === 'percentuale' ? '€ nominali' : 'quote'} (circa ${mostraPrezzo(perId[r.asset_id], r.prezzo_riferimento)} l'una)`}`).join(' · ')}
                  </span>
                  <span className="riga-azioni">
                    <button className="piccolo" onClick={() => onApri(p)}>Modifica</button>
                    <button className="piccolo" onClick={() => attiva(p)}>{p.attivo ? 'Sospendi' : 'Riattiva'}</button>
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
