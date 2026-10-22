import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, leggiNumero, perCampo } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'
import { durata, statisticheConcluso, tipologie } from '../../lib/investimenti'
import { percento } from '../../components/SchedaPosizione'

// Asset comprati e poi venduti fino all'ultima quota (vedi DECISIONI.md).
export function assetConclusi(asset, operazioni) {
  return asset.filter((a) => {
    const ops = operazioni.filter((o) => o.asset_id === a.id)
    if (!ops.some((o) => o.tipo === 'vendita')) return false
    const quantita = ops.reduce((t, o) => t + (o.tipo === 'acquisto' ? 1 : -1) * Number(o.quantita), 0)
    return Math.abs(quantita) < 1e-9
  })
}

export default function InvestimentiConclusi({ conclusi, operazioni, proventi, onCambia }) {
  if (!conclusi.length) return null
  // dall'ultimo chiuso al primo
  const conStatistiche = conclusi
    .map((a) => ({ a, s: statisticheConcluso(a, operazioni, proventi, a.inflazione_periodo) }))
    .sort((x, y) => (y.s.ultimaVendita ?? '').localeCompare(x.s.ultimaVendita ?? ''))
  return (
    <>
      <h2>Investimenti conclusi</h2>
      <div className="griglia-posizioni">
        {conStatistiche.map(({ a, s }) => <SchedaConclusa key={a.id} asset={a} s={s} onCambia={onCambia} />)}
      </div>
    </>
  )
}

const segnoPct = (x) => (x === null ? '—' : percento(x * 100))
const classe = (x) => (x === null ? '' : x >= 0 ? 'ok' : 'perdita')

function SchedaConclusa({ asset, s, onCambia }) {
  const salvata = asset.inflazione_periodo === null ? '' : perCampo(asset.inflazione_periodo)
  const [inflazione, setInflazione] = useState(salvata)
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const cambiata = inflazione.trim() !== salvata

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    const valore = inflazione.trim() ? leggiNumero(inflazione) : null
    if (inflazione.trim() && (valore === null || Number(valore) <= -100)) return setErrore("Scrivi l'inflazione in percentuale, es. 18,5.")
    setInvio(true)
    const { error } = await supabase.from('asset').update({ inflazione_periodo: valore }).eq('id', asset.id)
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    onCambia()
  }

  return (
    <div className="scheda posizione conclusa">
      <div className="posizione-titolo">
        <strong>{asset.nome}</strong>
        <span className="etichetta">{tipologie[asset.tipologia] ?? asset.tipologia}</span>
      </div>
      <p className="nota periodo-concluso">
        {dataBreve(s.primoAcquisto)} → {dataBreve(s.ultimaVendita)} · {durata(s.primoAcquisto, s.ultimaVendita)}
      </p>
      <dl className="dati">
        <dt>Investito (con spese)</dt><dd>{euro(s.investito)}</dd>
        <dt>Incassato (netto)</dt><dd>{euro(s.incassato)}</dd>
        {s.proventiNetti > 0 && <><dt>Dividendi / cedole netti</dt><dd>{euro(s.proventiNetti)}</dd></>}
        <dt><strong>Guadagno netto</strong></dt><dd className={classe(s.guadagno)}><strong>{euro(s.guadagno)}</strong></dd>
        <dt>Spese sostenute</dt><dd>{euro(s.spese)}</dd>
        <dt>Tasse</dt><dd>{euro(s.tasse)}</dd>
        <dt>ROI (sul totale investito)</dt><dd className={classe(s.roi)}>{segnoPct(s.roi)}</dd>
        <dt>TIR (rendimento annuo)</dt><dd className={classe(s.tir)}>{segnoPct(s.tir)}</dd>
        {s.roiReale !== null && <><dt>ROI reale</dt><dd className={classe(s.roiReale)}>{segnoPct(s.roiReale)}</dd></>}
        {s.tirReale !== null && <><dt>TIR reale (annuo)</dt><dd className={classe(s.tirReale)}>{segnoPct(s.tirReale)}</dd></>}
      </dl>
      <form className="riga-inflazione" onSubmit={salva}>
        <label>
          Inflazione nel periodo (%, facoltativa)
          <input inputMode="decimal" value={inflazione} onChange={(e) => setInflazione(e.target.value)} placeholder="es. 18,5" />
        </label>
        <button className="piccolo" disabled={!cambiata || invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </form>
      <p className="nota">Inflazione cumulata dal primo acquisto all'ultima vendita (la trovi con il calcolatore "Rivaluta" dell'ISTAT).</p>
      {errore && <p className="errore">{errore}</p>}
    </div>
  )
}
