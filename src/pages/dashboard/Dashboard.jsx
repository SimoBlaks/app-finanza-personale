import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, numero } from '../../lib/numeri'
import { caricaAlbero } from '../../lib/categorie'
import { caricaImpostazioni, caricaUltimiPrezzi, valuta } from '../../lib/prezzi'
import SchedaPosizione from '../../components/SchedaPosizione'
import BarreOrizzontali from '../../components/grafici/BarreOrizzontali'
import SezioneRisparmio from './SezioneRisparmio'
import SezioneSpese from './SezioneSpese'
import SezioneDebiti from './SezioneDebiti'

const dataOra = (ts) => new Date(ts).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function Dashboard() {
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const [liq, saldi, pos, asset, prezzi, imp, job, albero] = await Promise.all([
      supabase.from('liquidita').select('*').maybeSingle(),
      supabase.from('saldi_persone').select('*').order('nome'),
      supabase.from('posizioni').select('*'),
      supabase.from('asset').select('*, asset_esposizione_geografica (paese, percentuale)'),
      caricaUltimiPrezzi(),
      caricaImpostazioni(),
      supabase.from('esecuzioni_job').select('*').eq('job', 'ricorrenze').order('eseguito_il', { ascending: false }).limit(1).maybeSingle(),
      caricaAlbero(),
    ])
    const err = liq.error || saldi.error || pos.error || asset.error || prezzi.error || imp.error || job.error || albero.errore
    if (err) return setErrore(messaggioErrore(err))
    setD({ liquidita: liq.data, saldi: saldi.data, posizioni: pos.data, asset: asset.data, ultimi: prezzi.ultimi, impostazioni: imp.impostazioni, job: job.data, albero })
  }, [])

  useEffect(() => { carica() }, [carica])

  if (!d) return <section><h1>Dashboard</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  const perId = Object.fromEntries(d.asset.map((a) => [a.id, a]))
  const valutazioni = d.posizioni
    .filter((p) => Number(p.quantita) > 0)
    .map((p) => ({ p, a: perId[p.asset_id], v: valuta(perId[p.asset_id], p, d.ultimi[p.asset_id], d.impostazioni) }))
  const investimenti = valutazioni.reduce((t, { v }) => t + v.valore, 0)
  const crediti = d.saldi.reduce((t, s) => t + Math.max(Number(s.saldo), 0), 0)
  const debiti = d.saldi.reduce((t, s) => t + Math.max(-Number(s.saldo), 0), 0)
  const liquidita = d.liquidita ? Number(d.liquidita.liquidita) : null
  const patrimonio = (liquidita ?? 0) + investimenti + crediti - debiti

  // Esposizione geografica ponderata sul valore attuale (SPEC 3.7).
  const perPaese = new Map()
  for (const { a, v } of valutazioni) {
    const righe = a?.asset_esposizione_geografica ?? []
    if (!righe.length) perPaese.set('Non specificato', (perPaese.get('Non specificato') ?? 0) + v.valore)
    for (const r of righe) perPaese.set(r.paese, (perPaese.get(r.paese) ?? 0) + (v.valore * Number(r.percentuale)) / 100)
  }
  const esposizione = investimenti > 0
    ? [...perPaese.entries()].map(([paese, valore]) => ({ id: paese, etichetta: paese, valore: (valore / investimenti) * 100 })).sort((x, y) => y.valore - x.valore)
    : []

  return (
    <section className="dashboard">
      <h1 className="solo-lettori">Dashboard</h1>

      <div className="scheda patrimonio">
        <span className="nota">Patrimonio attuale</span>
        <p className="cifra-eroe">{euro(patrimonio)}</p>
        {liquidita === null && (
          <p className="avviso">
            Manca il saldo iniziale: la liquidità non è inclusa. <Link to="/impostazioni/generali">Impostalo qui</Link>.
          </p>
        )}
        <dl className="componenti-patrimonio">
          <div><dt>Liquidità</dt><dd>{liquidita === null ? '—' : euro(liquidita)}</dd></div>
          <div><dt>Investimenti</dt><dd>{euro(investimenti)}</dd></div>
          <div><dt>Crediti</dt><dd>{euro(crediti)}</dd></div>
          <div><dt>Debiti</dt><dd>{debiti > 0 ? `−${euro(debiti)}` : euro(0)}</dd></div>
        </dl>
      </div>

      <div className="griglia-dashboard">
        <SezioneRisparmio />
        <SezioneDebiti saldi={d.saldi} />
      </div>

      <SezioneSpese albero={d.albero} />

      <div className="intestazione-scheda">
        <h2>Investimenti</h2>
        {valutazioni.length > 0 && (
          <button className="piccolo" onClick={() => navigate('/investimenti', { state: { apri: 'prezzi' } })}>Aggiorna Prezzi</button>
        )}
      </div>
      {!valutazioni.length && <p className="nota">Nessun asset posseduto.</p>}
      <div className="griglia-posizioni">
        {valutazioni.map(({ p, a, v }) => <SchedaPosizione key={p.asset_id} asset={a} posizione={p} valutazione={v} />)}
      </div>

      {esposizione.length > 0 && (
        <div className="scheda">
          <h2>Esposizione geografica</h2>
          <p className="nota">Quota del portafoglio per paese, pesata sul valore attuale di ogni asset.</p>
          <BarreOrizzontali voci={esposizione} formatta={(n) => `${numero(n.toFixed(1))}%`} />
        </div>
      )}

      <p className="stato-job">
        {!d.job
          ? 'Il job delle ricorrenze non è ancora stato eseguito.'
          : d.job.esito === 'ok'
            ? `Ricorrenze: ultima esecuzione ${dataOra(d.job.eseguito_il)} · ${d.job.transazioni_create} transazioni create`
            : `Ricorrenze: ultima esecuzione ${dataOra(d.job.eseguito_il)} · errore: ${d.job.messaggio}`}
      </p>
    </section>
  )
}
