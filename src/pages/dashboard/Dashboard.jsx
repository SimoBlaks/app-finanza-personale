import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, numero, oggiISO } from '../../lib/numeri'
import { meseCorrente, nomeMese } from '../../lib/date'
import { caricaAlbero } from '../../lib/categorie'
import { caricaImpostazioni, caricaUltimiPrezzi, valuta } from '../../lib/prezzi'
import { tipologiePlurale } from '../../lib/investimenti'
import { liquiditaMensile, patrimonioMensile } from '../../lib/patrimonio'
import { tutteLeRighe } from '../../lib/righe'
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

const periodiPatrimonio = { 12: '1 anno', 60: '5 anni', tutto: 'Tutto' }

export default function Dashboard() {
  const [d, setD] = useState(null)
  const [periodo, setPeriodo] = useState(60)
  const [indietro, setIndietro] = useState(0) // mesi di spostamento del riquadro entrate e uscite
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const [liq, saldi, pos, asset, prezzi, imp, job, albero, mensile, operazioni, storico, condivise, rimborsi] = await Promise.all([
      supabase.from('liquidita').select('*').maybeSingle(),
      supabase.from('saldi_persone').select('*').order('nome'),
      supabase.from('posizioni').select('*'),
      supabase.from('asset').select('*, asset_esposizione_geografica (paese, percentuale)'),
      caricaUltimiPrezzi(),
      caricaImpostazioni(),
      supabase.from('esecuzioni_job').select('*').eq('job', 'ricorrenze').order('eseguito_il', { ascending: false }).limit(1).maybeSingle(),
      caricaAlbero(),
      supabase.from('riepilogo_mensile').select('mese, entrate, uscite, movimento_liquidita').order('mese'),
      // per il patrimonio nel tempo (operazioni e prezzi crescono negli anni: letti a pagine)
      tutteLeRighe(() => supabase.from('operazioni_investimento').select('id, asset_id, data, tipo, created_at, quantita_residua, costo_residuo').order('id')),
      tutteLeRighe(() => supabase.from('prezzi_storici').select('asset_id, data, prezzo_chiusura').order('data').order('asset_id')),
      supabase.from('transazioni').select('data, pagata_da, importo_totale, quota_personale').eq('condivisa', true),
      supabase.from('pagamenti_saldo').select('data, direzione, importo'),
    ])
    const err = liq.error || saldi.error || pos.error || asset.error || prezzi.error || imp.error || job.error || albero.errore || mensile.error ||
      operazioni.error || storico.error || condivise.error || rimborsi.error
    if (err) return setErrore(messaggioErrore(err))
    setD({
      liquidita: liq.data, saldi: saldi.data, posizioni: pos.data, asset: asset.data, ultimi: prezzi.ultimi,
      impostazioni: imp.impostazioni, job: job.data, albero, mensile: mensile.data,
      operazioni: operazioni.data, storico: storico.data, condivise: condivise.data, rimborsi: rimborsi.data,
    })
  }, [])

  useEffect(() => { carica() }, [carica])

  // Mese per mese: entrate/uscite e liquidità a fine mese (saldo iniziale + movimenti cumulati).
  const serie = useMemo(() => {
    if (!d) return null
    const perMese = new Map(d.mensile.map((m) => [m.mese.slice(0, 7), m]))
    const liquidita = liquiditaMensile(d.liquidita, d.mensile, meseCorrente()).map((m) => ({ ...m, etichetta: meseEAnno(m.id) }))
    const mesi = liquidita.map((m) => m.id)
    // entrate e uscite di tutti i mesi: il riquadro ne mostra 12 alla volta
    const entrateUscite = mesi.map((am) => {
      const m = perMese.get(am)
      return { id: am, etichetta: meseBreve(am), etichettaLunga: nomeMese(am), a: Number(m?.entrate ?? 0), b: Number(m?.uscite ?? 0) }
    })
    // le spese partono dall'ultimo mese che ne contiene (di solito il mese corrente)
    const ultimoConSpese = [...d.mensile].reverse().find((m) => Number(m.uscite) > 0)?.mese.slice(0, 7)
    const patrimonio = patrimonioMensile({
      liquidita, asset: d.asset, operazioni: d.operazioni, prezzi: d.storico, condivise: d.condivise, rimborsi: d.rimborsi, oggi: oggiISO(),
    }).map((p) => ({
      ...p,
      dettaglio: `Liquidità ${euro(p.parti.liquidita)} · Investimenti ${euro(p.parti.investimenti)}` +
        (Math.abs(p.parti.persone) >= 0.005 ? ` · ${p.parti.persone > 0 ? 'Crediti' : 'Debiti'} ${euro(Math.abs(p.parti.persone))}` : ''),
    }))
    return { patrimonio, entrateUscite, ultimoConSpese }
  }, [d])

  if (!d || !serie) return <section><h1>Dashboard</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  const perId = Object.fromEntries(d.asset.map((a) => [a.id, a]))
  const valutazioni = d.posizioni
    .filter((p) => Number(p.quantita) > 0)
    .map((p) => ({ p, a: perId[p.asset_id], v: valuta(perId[p.asset_id], p, d.ultimi[p.asset_id], d.impostazioni) }))
  // gli asset esclusi dal patrimonio (es. fondo pensione) restano visibili ma non entrano nei totali
  const nelPatrimonio = valutazioni.filter(({ a }) => !a?.escluso_dal_patrimonio)
  const investimenti = nelPatrimonio.reduce((t, { v }) => t + v.valore, 0)
  const crediti = d.saldi.reduce((t, s) => t + Math.max(Number(s.saldo), 0), 0)
  const debiti = d.saldi.reduce((t, s) => t + Math.max(-Number(s.saldo), 0), 0)
  const liquidita = d.liquidita ? Number(d.liquidita.liquidita) : null
  const patrimonio = (liquidita ?? 0) + investimenti + crediti - debiti

  // 12 mesi di entrate e uscite, spostati indietro di "indietro" mesi rispetto a oggi
  const fineFinestra = serie.entrateUscite.length - Math.min(indietro, Math.max(serie.entrateUscite.length - 12, 0))
  const finestra = { inizio: Math.max(fineFinestra - 12, 0), mesi: serie.entrateUscite.slice(Math.max(fineFinestra - 12, 0), fineFinestra) }

  // variazione del patrimonio negli ultimi 12 mesi
  const ultimi13 = serie.patrimonio.slice(-13)
  const variazione = ultimi13.length > 1 ? ultimi13[ultimi13.length - 1].valore - ultimi13[0].valore : null

  // Esposizione geografica ponderata sul valore attuale (SPEC 3.7).
  // Lo stesso paese si somma tra asset diversi anche se scritto con maiuscole o spazi diversi;
  // le voci "Altri paesi" degli asset finiscono insieme ai paesi minori del grafico.
  const ALTRI = 'altri paesi'
  const perPaese = new Map() // chiave normalizzata → { nome, valore }
  const aggiungi = (nome, valore) => {
    const chiave = nome.trim().toLowerCase().replace(/\s+/g, ' ')
    const voce = perPaese.get(chiave) ?? { nome: nome.trim(), valore: 0 }
    voce.valore += valore
    perPaese.set(chiave, voce)
  }
  for (const { a, v } of nelPatrimonio) {
    const righe = a?.asset_esposizione_geografica ?? []
    if (!righe.length) aggiungi('Non specificato', v.valore)
    for (const r of righe) aggiungi(r.paese, (v.valore * Number(r.percentuale)) / 100)
  }
  const altriDichiarati = perPaese.get(ALTRI)?.valore ?? 0
  const paesi = [...perPaese.entries()].filter(([k]) => k !== ALTRI).map(([, x]) => x).sort((x, y) => y.valore - x.valore)
  const esposizione = paesi.slice(0, 7).map((x, i) => ({ id: x.nome, etichetta: x.nome, valore: x.valore, colore: coloreSerie(i) }))
  const altri = altriDichiarati + paesi.slice(7).reduce((t, x) => t + x.valore, 0)
  if (altri > 0) esposizione.push({ id: 'altro', etichetta: 'Altri paesi', valore: altri, colore: COLORE_ALTRO })

  // Investito per tipologia di strumento (azioni, ETF, obbligazioni, fondi), sul valore attuale.
  const perTipologia = new Map()
  for (const { a, v } of nelPatrimonio) perTipologia.set(a?.tipologia, (perTipologia.get(a?.tipologia) ?? 0) + v.valore)
  const strumenti = [...perTipologia.entries()]
    .filter(([, valore]) => valore > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([t, valore], i) => ({ id: t ?? 'altro', etichetta: tipologiePlurale[t] ?? 'Altro', valore, colore: coloreSerie(i) }))

  const patrimonioNelPeriodo = periodo === 'tutto' ? serie.patrimonio : serie.patrimonio.slice(-periodo)
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
                {variazione >= 0 ? '▲' : '▼'} {euro(Math.abs(variazione))} negli ultimi 12 mesi
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
        <Link to="/riepilogo" className="link-riepilogo">Riepilogo dell'anno ›</Link>
      </div>

      {/* colonna sinistra su schermi larghi: spese/entrate, poi risparmio ed entrate-uscite */}
      <div className="colonna-sinistra">
      <SezioneSpese albero={d.albero} meseIniziale={serie.ultimoConSpese} />

      <div className="griglia-dashboard larga">
        <SezioneRisparmio />
        <div className="scheda">
          <h2>Entrate e uscite · 12 mesi</h2>
          <div className="selettore-mese compatto">
            <button className="piccolo" onClick={() => setIndietro((n) => n + 1)} disabled={finestra.inizio === 0} aria-label="Mese precedente">‹</button>
            <strong>{finestra.mesi.length ? `${meseEAnno(finestra.mesi[0].id)} – ${meseEAnno(finestra.mesi.at(-1).id)}` : ''}</strong>
            <button className="piccolo" onClick={() => setIndietro((n) => n - 1)} disabled={indietro === 0} aria-label="Mese successivo">›</button>
          </div>
          <ColonneDoppie
            mesi={finestra.mesi}
            serie={[
              { chiave: 'a', etichetta: 'Entrate', colore: 'var(--entrate)' },
              { chiave: 'b', etichetta: 'Uscite', colore: 'var(--uscite)' },
            ]}
            formatta={euro}
          />
        </div>
      </div>
      </div>

      {/* colonna destra su schermi larghi: patrimonio, debiti/crediti e investimenti */}
      <div className="colonna-destra">
      <div className="scheda area-patrimonio">
        <div className="intestazione-scheda">
          <h2>Patrimonio nel tempo</h2>
          <div className="interruttore-vista">
            {Object.entries(periodiPatrimonio).map(([k, l]) => (
              <button key={k} className={String(periodo) === k ? 'attivo' : ''} onClick={() => setPeriodo(k === 'tutto' ? 'tutto' : Number(k))}>{l}</button>
            ))}
          </div>
        </div>
        <Area punti={patrimonioNelPeriodo} formatta={euro} altezza={200} />
        <p className="nota">Investimenti valutati all'ultimo prezzo inserito fino a quel mese; senza prezzo, al costo di acquisto (PMC).</p>
      </div>

      <div className="griglia-dashboard area-altro">
        <SezioneDebiti saldi={d.saldi} />
        <div className="scheda esposizione">
          <h2>Investito per strumento</h2>
          {strumenti.length > 0 ? (
            <Ciambella voci={strumenti} formatta={euro} titoloCentro="Investito" />
          ) : (
            <p className="nota">Comparirà quando avrai degli investimenti.</p>
          )}
        </div>
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

      <p className="stato-job">
        {!d.job
          ? 'Il job delle ricorrenze non è ancora stato eseguito.'
          : d.job.esito === 'ok'
            ? `Ricorrenze: ultima esecuzione ${dataOra(d.job.eseguito_il)} · ${numero(d.job.transazioni_create)} transazioni create${d.job.operazioni_create ? ` · ${numero(d.job.operazioni_create)} acquisti dei piani` : ''}`
            : `Ricorrenze: ultima esecuzione ${dataOra(d.job.eseguito_il)} · errore: ${d.job.messaggio}`}
      </p>
    </section>
  )
}
