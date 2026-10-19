import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, numero } from '../../lib/numeri'
import { aggiungiMesi, meseCorrente, nomeMese } from '../../lib/date'
import { caricaAlbero } from '../../lib/categorie'
import { caricaImpostazioni, caricaUltimiPrezzi, valuta } from '../../lib/prezzi'
import SchedaPosizione from '../../components/SchedaPosizione'
import InterruttoreCifre from '../../components/Riservatezza'
import Area from '../../components/grafici/Area'
import Ciambella from '../../components/grafici/Ciambella'
import ColonneDoppie from '../../components/grafici/ColonneDoppie'
import { COLORE_ALTRO, coloreSerie } from '../../components/grafici/colori'
import SezioneRisparmio from './SezioneRisparmio'
import SezioneSpese from './SezioneSpese'
import SezioneDebiti from './SezioneDebiti'

const dataOra = (ts) => new Date(ts).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const meseBreve = (am) => new Date(`${am}-15T12:00:00`).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')
const meseEAnno = (am) => new Date(`${am}-15T12:00:00`).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }).replace('.', '')

// Icone semplici per i riquadri del patrimonio
const icone = {
  liquidita: <path d="M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2" />,
  investimenti: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  crediti: <path d="M12 19V5M5 12l7-7 7 7" />,
  debiti: <path d="M12 5v14M5 12l7 7 7-7" />,
}
const Icona = ({ nome }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {icone[nome]}
  </svg>
)

const periodiLiquidita = { 12: '1 anno', 60: '5 anni', tutto: 'Tutto' }

export default function Dashboard() {
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [periodo, setPeriodo] = useState(60)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const [liq, saldi, pos, asset, prezzi, imp, job, albero, mensile] = await Promise.all([
      supabase.from('liquidita').select('*').maybeSingle(),
      supabase.from('saldi_persone').select('*').order('nome'),
      supabase.from('posizioni').select('*'),
      supabase.from('asset').select('*, asset_esposizione_geografica (paese, percentuale)'),
      caricaUltimiPrezzi(),
      caricaImpostazioni(),
      supabase.from('esecuzioni_job').select('*').eq('job', 'ricorrenze').order('eseguito_il', { ascending: false }).limit(1).maybeSingle(),
      caricaAlbero(),
      supabase.from('riepilogo_mensile').select('mese, entrate, uscite, movimento_liquidita').order('mese'),
    ])
    const err = liq.error || saldi.error || pos.error || asset.error || prezzi.error || imp.error || job.error || albero.errore || mensile.error
    if (err) return setErrore(messaggioErrore(err))
    setD({
      liquidita: liq.data, saldi: saldi.data, posizioni: pos.data, asset: asset.data, ultimi: prezzi.ultimi,
      impostazioni: imp.impostazioni, job: job.data, albero, mensile: mensile.data,
    })
  }, [])

  useEffect(() => { carica() }, [carica])

  // Mese per mese: entrate/uscite e liquidità a fine mese (saldo iniziale + movimenti cumulati).
  const serie = useMemo(() => {
    if (!d) return null
    const perMese = new Map(d.mensile.map((m) => [m.mese.slice(0, 7), m]))
    const inizio = d.liquidita?.data_saldo_iniziale?.slice(0, 7) ?? d.mensile[0]?.mese.slice(0, 7) ?? meseCorrente()
    const mesi = []
    for (let am = inizio; am <= meseCorrente(); am = aggiungiMesi(`${am}-01`, 1).slice(0, 7)) mesi.push(am)
    let cumulato = Number(d.liquidita?.saldo_iniziale ?? 0)
    const liquidita = mesi.map((am) => {
      cumulato += Number(perMese.get(am)?.movimento_liquidita ?? 0)
      return { id: am, etichetta: meseEAnno(am), valore: cumulato }
    })
    const ultimi12 = mesi.slice(-12).map((am) => {
      const m = perMese.get(am)
      return { id: am, etichetta: meseBreve(am), etichettaLunga: nomeMese(am), a: Number(m?.entrate ?? 0), b: Number(m?.uscite ?? 0) }
    })
    // le spese partono dall'ultimo mese che ne contiene (di solito il mese corrente)
    const ultimoConSpese = [...d.mensile].reverse().find((m) => Number(m.uscite) > 0)?.mese.slice(0, 7)
    return { liquidita, ultimi12, ultimoConSpese }
  }, [d])

  if (!d || !serie) return <section><h1>Dashboard</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  const perId = Object.fromEntries(d.asset.map((a) => [a.id, a]))
  const valutazioni = d.posizioni
    .filter((p) => Number(p.quantita) > 0)
    .map((p) => ({ p, a: perId[p.asset_id], v: valuta(perId[p.asset_id], p, d.ultimi[p.asset_id], d.impostazioni) }))
  const investimenti = valutazioni.reduce((t, { v }) => t + v.valore, 0)
  const crediti = d.saldi.reduce((t, s) => t + Math.max(Number(s.saldo), 0), 0)
  const debiti = d.saldi.reduce((t, s) => t + Math.max(-Number(s.saldo), 0), 0)
  const liquidita = d.liquidita ? Number(d.liquidita.liquidita) : null
  const patrimonio = (liquidita ?? 0) + investimenti + crediti - debiti

  // variazione della liquidità negli ultimi 12 mesi (l'andamento storico degli investimenti non è noto)
  const ultimi13 = serie.liquidita.slice(-13)
  const variazione = ultimi13.length > 1 ? ultimi13[ultimi13.length - 1].valore - ultimi13[0].valore : null

  // Esposizione geografica ponderata sul valore attuale (SPEC 3.7).
  const perPaese = new Map()
  for (const { a, v } of valutazioni) {
    const righe = a?.asset_esposizione_geografica ?? []
    if (!righe.length) perPaese.set('Non specificato', (perPaese.get('Non specificato') ?? 0) + v.valore)
    for (const r of righe) perPaese.set(r.paese, (perPaese.get(r.paese) ?? 0) + (v.valore * Number(r.percentuale)) / 100)
  }
  const paesi = [...perPaese.entries()].sort((x, y) => y[1] - x[1])
  const esposizione = paesi.slice(0, 7).map(([paese, valore], i) => ({ id: paese, etichetta: paese, valore, colore: coloreSerie(i) }))
  if (paesi.length > 7) esposizione.push({ id: 'altro', etichetta: 'Altri paesi', valore: paesi.slice(7).reduce((t, [, v]) => t + v, 0), colore: COLORE_ALTRO })

  const liquiditaNelPeriodo = periodo === 'tutto' ? serie.liquidita : serie.liquidita.slice(-periodo)
  const riquadri = [
    { nome: 'liquidita', etichetta: 'Liquidità', valore: liquidita === null ? '—' : euro(liquidita) },
    { nome: 'investimenti', etichetta: 'Investimenti', valore: euro(investimenti) },
    { nome: 'crediti', etichetta: 'Crediti', valore: euro(crediti) },
    { nome: 'debiti', etichetta: 'Debiti', valore: debiti > 0 ? `−${euro(debiti)}` : euro(0) },
  ]

  return (
    <section className="dashboard">
      <h1 className="solo-lettori">Dashboard</h1>

      <div className="scheda patrimonio">
        <div className="patrimonio-testa">
          <div>
            <div className="patrimonio-riga">
              <span className="patrimonio-etichetta">Patrimonio attuale</span>
              <InterruttoreCifre etichetta="Nascondi" />
            </div>
            <p className="cifra-eroe">{euro(patrimonio)}</p>
            {variazione !== null && (
              <span className={`variazione ${variazione >= 0 ? 'su' : 'giu'}`}>
                {variazione >= 0 ? '▲' : '▼'} {euro(Math.abs(variazione))} di liquidità negli ultimi 12 mesi
              </span>
            )}
          </div>
          <div className="patrimonio-sparkline">
            <Area punti={ultimi13} formatta={euro} altezza={64} compatto colore="var(--primario)" />
          </div>
        </div>
        {liquidita === null && (
          <p className="avviso">
            Manca il saldo iniziale: la liquidità non è inclusa. <Link to="/impostazioni/generali">Impostalo qui</Link>.
          </p>
        )}
        <div className="riquadri">
          {riquadri.map((r) => (
            <div key={r.nome} className={`riquadro-kpi ${r.nome}`}>
              <span className="icona-kpi"><Icona nome={r.nome} /></span>
              <span className="kpi-etichetta">{r.etichetta}</span>
              <strong className="kpi-valore">{r.valore}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="griglia-dashboard larga">
        <div className="scheda">
          <h2>Entrate e uscite · ultimi 12 mesi</h2>
          <ColonneDoppie
            mesi={serie.ultimi12}
            serie={[
              { chiave: 'a', etichetta: 'Entrate', colore: 'var(--entrate)' },
              { chiave: 'b', etichetta: 'Uscite', colore: 'var(--uscite)' },
            ]}
            formatta={euro}
          />
        </div>
        <SezioneRisparmio />
      </div>

      <SezioneSpese albero={d.albero} meseIniziale={serie.ultimoConSpese} />

      {/* colonna destra su schermi larghi: liquidità, debiti/crediti ed esposizione */}
      <div className="colonna-destra">
      <div className="scheda area-liquidita">
        <div className="intestazione-scheda">
          <h2>Liquidità nel tempo</h2>
          <div className="interruttore-vista">
            {Object.entries(periodiLiquidita).map(([k, l]) => (
              <button key={k} className={String(periodo) === k ? 'attivo' : ''} onClick={() => setPeriodo(k === 'tutto' ? 'tutto' : Number(k))}>{l}</button>
            ))}
          </div>
        </div>
        <Area punti={liquiditaNelPeriodo} formatta={euro} altezza={200} />
      </div>

      <div className="griglia-dashboard area-altro">
        <SezioneDebiti saldi={d.saldi} />
        {esposizione.length > 0 ? (
          <div className="scheda esposizione">
            <h2>Esposizione geografica</h2>
            <Ciambella voci={esposizione} formatta={euro} titoloCentro="Investito" />
          </div>
        ) : (
          <div className="scheda">
            <h2>Esposizione geografica</h2>
            <p className="nota">Comparirà quando avrai degli investimenti con l'esposizione geografica impostata.</p>
          </div>
        )}
      </div>
      </div>

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

      <p className="stato-job">
        {!d.job
          ? 'Il job delle ricorrenze non è ancora stato eseguito.'
          : d.job.esito === 'ok'
            ? `Ricorrenze: ultima esecuzione ${dataOra(d.job.eseguito_il)} · ${numero(d.job.transazioni_create)} transazioni create`
            : `Ricorrenze: ultima esecuzione ${dataOra(d.job.eseguito_il)} · errore: ${d.job.messaggio}`}
      </p>
    </section>
  )
}
