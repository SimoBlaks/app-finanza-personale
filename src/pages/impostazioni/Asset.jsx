import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { inCentesimi, leggiNumero, numero, perCampo } from '../../lib/numeri'

const tipologie = { azione: 'Azione', etf: 'ETF', obbligazione: 'Obbligazione' }

const vuoto = {
  id: null,
  ticker_isin: '',
  nome: '',
  tipologia: 'etf',
  aliquota_tassa: '26',
  righe: [{ paese: '', percentuale: '' }],
}

// Controlla le righe dell'esposizione e restituisce { errore, totale, righe }.
function verificaEsposizione(righe) {
  const compilate = righe.filter((r) => r.paese.trim() || r.percentuale.trim())
  let totale = 0
  const paesi = new Set()
  const pulite = []
  for (const r of compilate) {
    const p = leggiNumero(r.percentuale)
    if (!r.paese.trim()) return { errore: 'Ogni riga deve avere un paese.', totale }
    if (p === null || Number(p) <= 0 || Number(p) > 100) return { errore: `Percentuale non valida per ${r.paese}.`, totale }
    const chiave = r.paese.trim().toLowerCase()
    if (paesi.has(chiave)) return { errore: `${r.paese} compare due volte.`, totale }
    paesi.add(chiave)
    totale += inCentesimi(p)
    pulite.push({ paese: r.paese.trim(), percentuale: p })
  }
  if (pulite.length && totale !== 10000) return { errore: 'La somma delle percentuali deve essere esattamente 100%.', totale }
  return { errore: '', totale, righe: pulite }
}

function ModuloAsset({ iniziale, onFine }) {
  const [f, setF] = useState(iniziale)
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const imposta = (campo, valore) => setF((x) => ({ ...x, [campo]: valore }))
  const impostaRiga = (i, campo, valore) =>
    setF((x) => ({ ...x, righe: x.righe.map((r, j) => (j === i ? { ...r, [campo]: valore } : r)) }))

  const esposizione = verificaEsposizione(f.righe)
  const quotazione = f.tipologia === 'obbligazione' ? 'percentuale' : 'unitaria'

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    if (!f.ticker_isin.trim() || !f.nome.trim()) return setErrore('Ticker/ISIN e nome sono obbligatori.')
    if (esposizione.errore) return setErrore(esposizione.errore)

    const dati = {
      ticker_isin: f.ticker_isin.trim(),
      nome: f.nome.trim(),
      tipologia: f.tipologia,
      quotazione,
      aliquota_tassa: f.aliquota_tassa,
      // prezzi solo manuali (vedi DECISIONI.md)
      aggiornamento_automatico: false,
      simbolo_fonte: null,
    }
    setInvio(true)
    const risposta = f.id
      ? await supabase.from('asset').update(dati).eq('id', f.id).select('id').single()
      : await supabase.from('asset').insert(dati).select('id').single()
    if (risposta.error) {
      setInvio(false)
      return setErrore(messaggioErrore(risposta.error))
    }
    const { error } = await supabase.rpc('salva_esposizione_geografica', {
      p_asset_id: risposta.data.id,
      p_righe: esposizione.righe,
    })
    setInvio(false)
    if (error) return setErrore(`Asset salvato, ma l'esposizione no: ${messaggioErrore(error)}`)
    onFine()
  }

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>{f.id ? 'Modifica asset' : 'Nuovo asset'}</h2>
      <div className="griglia">
        <label>Ticker / ISIN<input value={f.ticker_isin} onChange={(e) => imposta('ticker_isin', e.target.value)} /></label>
        <label>Nome<input value={f.nome} onChange={(e) => imposta('nome', e.target.value)} /></label>
        <label>
          Tipologia
          <select
            value={f.tipologia}
            onChange={(e) => {
              imposta('tipologia', e.target.value)
              if (!f.id) imposta('aliquota_tassa', e.target.value === 'obbligazione' ? '12.5' : '26')
            }}
          >
            {Object.entries(tipologie).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          Aliquota tassa
          <select value={f.aliquota_tassa} onChange={(e) => imposta('aliquota_tassa', e.target.value)}>
            <option value="26">26%</option>
            <option value="12.5">12,5%</option>
          </select>
        </label>
      </div>
      <p className="nota">
        Quotazione: <strong>{quotazione === 'percentuale' ? 'in % del nominale' : 'prezzo unitario'}</strong>
        {quotazione === 'percentuale' && ' (la quantità sarà il valore nominale in euro)'}
      </p>

      <h3>Esposizione geografica</h3>
      {f.righe.map((r, i) => (
        <div className="riga-esposizione" key={i}>
          <input placeholder="Paese" value={r.paese} onChange={(e) => impostaRiga(i, 'paese', e.target.value)} />
          <input placeholder="%" inputMode="decimal" value={r.percentuale} onChange={(e) => impostaRiga(i, 'percentuale', e.target.value)} />
          <button type="button" className="piccolo" aria-label="Togli riga" onClick={() => setF((x) => ({ ...x, righe: x.righe.filter((_, j) => j !== i) }))}>✕</button>
        </div>
      ))}
      <div className="riga-totale">
        <button type="button" className="piccolo" onClick={() => setF((x) => ({ ...x, righe: [...x.righe, { paese: '', percentuale: '' }] }))}>+ Paese</button>
        <span className={esposizione.totale === 10000 ? 'ok' : 'attenzione'}>Totale: {numero(esposizione.totale / 100)}%</span>
      </div>

      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}

export default function Asset() {
  const [asset, setAsset] = useState([])
  const [inModifica, setInModifica] = useState(null)
  const [archiviati, setArchiviati] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('asset')
      .select('*, asset_esposizione_geografica (paese, percentuale)')
      .order('nome')
    if (error) return setErrore(messaggioErrore(error))
    setAsset(data)
  }, [])

  useEffect(() => { carica() }, [carica])

  async function esegui(richiesta) {
    setErrore('')
    const { error } = await richiesta
    if (error) return setErrore(messaggioErrore(error))
    carica()
  }

  const modifica = (a) =>
    setInModifica({
      id: a.id,
      ticker_isin: a.ticker_isin,
      nome: a.nome,
      tipologia: a.tipologia,
      aliquota_tassa: String(Number(a.aliquota_tassa)),
      righe: a.asset_esposizione_geografica.length
        ? a.asset_esposizione_geografica.map((r) => ({ paese: r.paese, percentuale: perCampo(r.percentuale) }))
        : [{ paese: '', percentuale: '' }],
    })

  if (inModifica) return <ModuloAsset iniziale={inModifica} onFine={() => { setInModifica(null); carica() }} />

  return (
    <div className="scheda">
      <div className="intestazione-scheda">
        <h2>Anagrafica asset</h2>
        <label className="interruttore">
          <input type="checkbox" checked={archiviati} onChange={(e) => setArchiviati(e.target.checked)} />
          Mostra archiviati
        </label>
      </div>
      {errore && <p className="errore">{errore}</p>}
      {asset.filter((a) => archiviati || a.attivo).map((a) => (
        <div key={a.id} className={`asset-voce ${a.attivo ? '' : 'archiviata'}`}>
          <div>
            <strong>{a.nome}</strong> <span className="nota">{a.ticker_isin}</span>
            {!a.attivo && <span className="etichetta">archiviato</span>}
            <div className="nota">
              {tipologie[a.tipologia]} · tasse {numero(a.aliquota_tassa)}%            </div>
            <div className="nota">
              {a.asset_esposizione_geografica.length
                ? a.asset_esposizione_geografica.map((r) => `${r.paese} ${numero(r.percentuale)}%`).join(', ')
                : 'Esposizione geografica non impostata'}
            </div>
          </div>
          <div className="riga-azioni">
            <button className="piccolo" onClick={() => modifica(a)}>Modifica</button>
            <button className="piccolo" onClick={() => esegui(supabase.from('asset').update({ attivo: !a.attivo }).eq('id', a.id))}>
              {a.attivo ? 'Archivia' : 'Ripristina'}
            </button>
            <button
              className="piccolo pericolo"
              onClick={() => window.confirm(`Eliminare "${a.nome}"?`) && esegui(supabase.from('asset').delete().eq('id', a.id))}
            >
              Elimina
            </button>
          </div>
        </div>
      ))}
      <button className="primario" onClick={() => setInModifica(vuoto)}>+ Nuovo asset</button>
    </div>
  )
}
