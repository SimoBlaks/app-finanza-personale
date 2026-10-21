import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'
import { fattore, mostraPrezzo, mostraQuantita } from '../../lib/investimenti'
import { caricaImpostazioni, caricaUltimiPrezzi, valuta } from '../../lib/prezzi'
import SchedaPosizione, { percento, sommaProventi } from '../../components/SchedaPosizione'
import ModuloOperazione from './ModuloOperazione'
import ModuloProvento from './ModuloProvento'
import { ElencoPiani, ModuloPiano } from './PianiAccumulo'
import AggiornaPrezzi from './AggiornaPrezzi'
import StoricoPrezzi from './StoricoPrezzi'

export default function Investimenti() {
  const location = useLocation()
  const navigate = useNavigate()
  const [asset, setAsset] = useState(null)
  const [posizioni, setPosizioni] = useState([])
  const [operazioni, setOperazioni] = useState([])
  const [proventi, setProventi] = useState([])
  const [piani, setPiani] = useState([])
  const [righePiani, setRighePiani] = useState([])
  const [ultimi, setUltimi] = useState({})
  const [impostazioni, setImpostazioni] = useState(null)
  // dalla dashboard si può arrivare qui con la schermata prezzi già aperta
  const [modulo, setModulo] = useState(location.state?.apri === 'prezzi' ? { tipo: 'prezzi' } : null) // { tipo: 'acquisto' | 'vendita' | 'prezzi' | 'storico', … }
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const [a, p, o, u, i, pv, pa, pr] = await Promise.all([
      supabase.from('asset').select('*').order('nome'),
      supabase.from('posizioni').select('*'),
      supabase.from('operazioni_investimento').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }),
      caricaUltimiPrezzi(),
      caricaImpostazioni(),
      supabase.from('proventi_investimento').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('piani_accumulo').select('*').order('attivo', { ascending: false }).order('nome'),
      supabase.from('piani_accumulo_righe').select('*').order('created_at'),
    ])
    const err = a.error || p.error || o.error || u.error || i.error || pv.error || pa.error || pr.error
    if (err) return setErrore(messaggioErrore(err))
    setAsset(a.data)
    setPosizioni(p.data)
    setOperazioni(o.data)
    setProventi(pv.data)
    setPiani(pa.data)
    setRighePiani(pr.data)
    setUltimi(u.ultimi)
    setImpostazioni(i.impostazioni)
  }, [])

  useEffect(() => { carica() }, [carica])

  if (!asset) return <section><h1>Investimenti</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  const perId = Object.fromEntries(asset.map((a) => [a.id, a]))
  const possedute = posizioni.filter((p) => Number(p.quantita) > 0)

  const chiudi = () => {
    if (location.state) navigate('.', { replace: true, state: null })
    setModulo(null)
    carica()
  }

  if (modulo?.tipo === 'prezzi')
    return (
      <section>
        <AggiornaPrezzi asset={asset} posizioni={posizioni} ultimi={ultimi} impostazioni={impostazioni} onFine={chiudi} />
      </section>
    )

  if (modulo?.tipo === 'piano')
    return (
      <section>
        <ModuloPiano
          piano={modulo.piano}
          righe={modulo.piano ? righePiani.filter((r) => r.piano_id === modulo.piano.id) : null}
          asset={asset}
          ultimi={ultimi}
          posizioni={posizioni}
          onFine={chiudi}
        />
      </section>
    )

  if (modulo?.tipo === 'storico')
    return (
      <section>
        <StoricoPrezzi asset={modulo.asset} onFine={chiudi} />
      </section>
    )

  const valutazioni = possedute.map((p) => ({ p, a: perId[p.asset_id], v: valuta(perId[p.asset_id], p, ultimi[p.asset_id], impostazioni) }))
  const esclusi = valutazioni.filter(({ a }) => a?.escluso_dal_patrimonio).length
  // i totali non contano gli asset esclusi dal patrimonio (es. fondo pensione)
  const totale = valutazioni.filter(({ a }) => !a?.escluso_dal_patrimonio).reduce(
    (t, { p, v }) => ({ valore: t.valore + v.valore, costo: t.costo + Number(p.costo_carico) }),
    { valore: 0, costo: 0 },
  )

  const proventiPerAsset = sommaProventi(proventi)
  const daVerificare = operazioni.filter((o) => o.da_verificare).length
  // operazioni e proventi insieme, dal più recente
  const cronologia = [
    ...operazioni.map((o) => ({ ...o, genere: 'operazione' })),
    ...proventi.map((x) => ({ ...x, genere: 'provento' })),
  ].sort((x, y) => y.data.localeCompare(x.data) || y.created_at.localeCompare(x.created_at))

  if (modulo?.tipo === 'provento')
    return (
      <section>
        <ModuloProvento provento={modulo.provento} asset={asset} posizioni={posizioni} onFine={chiudi} />
      </section>
    )

  if (modulo)
    return (
      <section>
        <ModuloOperazione
          tipo={modulo.tipo}
          operazione={modulo.operazione}
          asset={asset}
          posizioni={posizioni}
          operazioni={operazioni}
          onFine={chiudi}
        />
      </section>
    )

  return (
    <section>
      <h1>Investimenti</h1>
      <div className="azioni-pagina uguali">
        <button className="primario" onClick={() => setModulo({ tipo: 'acquisto', operazione: null })}>+ Nuovo acquisto</button>
        <button onClick={() => setModulo({ tipo: 'vendita', operazione: null })} disabled={!possedute.length}>Vendita</button>
        <button onClick={() => setModulo({ tipo: 'provento', provento: null })} disabled={!asset.length}>Dividendo / cedola</button>
      </div>
      {!asset.length && <p className="nota">Aggiungi prima gli asset in Impostazioni → Asset.</p>}
      {daVerificare > 0 && (
        <p className="avviso">
          {daVerificare === 1 ? "C'è 1 acquisto" : `Ci sono ${daVerificare} acquisti`} dei piani di accumulo da verificare: aprili nella cronologia e correggi quantità e prezzo con i dati reali.
        </p>
      )}
      {errore && <p className="errore">{errore}</p>}

      <div className="intestazione-scheda">
        <h2>Posizioni</h2>
        {possedute.length > 0 && <button className="piccolo" onClick={() => setModulo({ tipo: 'prezzi' })}>Aggiorna Prezzi</button>}
      </div>
      {!possedute.length && <p className="nota">Nessun asset posseduto.</p>}
      {possedute.length > 0 && (
        <div className="totali-mese">
          <div><span className="nota">Valore attuale</span><strong className="importo">{euro(totale.valore)}</strong></div>
          <div>
            <span className="nota">Guadagno / perdita</span>
            <strong className={`importo ${totale.valore - totale.costo >= 0 ? 'incasso' : 'spesa'}`}>
              {euro(totale.valore - totale.costo)}
              {totale.costo > 0 && ` (${percento(((totale.valore - totale.costo) / totale.costo) * 100)})`}
            </strong>
          </div>
        </div>
      )}
      {esclusi > 0 && <p className="nota">I totali non comprendono gli asset esclusi dal patrimonio.</p>}
      <div className="griglia-posizioni">
        {valutazioni.map(({ p, a, v }) => (
          <SchedaPosizione key={p.asset_id} asset={a} posizione={p} valutazione={v} proventi={proventiPerAsset[p.asset_id]}>
            <div className="riga-azioni azioni-posizione">
              <button className="piccolo" onClick={() => setModulo({ tipo: 'storico', asset: a })}>Storico prezzi</button>
            </div>
          </SchedaPosizione>
        ))}
      </div>

      <ElencoPiani piani={piani} righe={righePiani} asset={asset} onApri={(piano) => setModulo({ tipo: 'piano', piano })} onCambia={carica} />

      <h2>Cronologia operazioni</h2>
      {!cronologia.length && <p className="nota">Nessuna operazione registrata.</p>}
      {cronologia.length > 0 && (
        <div className="scheda elenco-movimenti">
          {cronologia.map((o) => {
            const a = perId[o.asset_id]
            if (o.genere === 'provento')
              return (
                <button key={o.id} className="movimento" onClick={() => setModulo({ tipo: 'provento', provento: o })}>
                  <span className="movimento-testo">
                    <strong>{o.tipo === 'cedola' ? 'Cedola' : 'Dividendo'} · {a?.nome}</strong>
                    <span className="nota">
                      {dataBreve(o.data)} · lordo {euro(o.importo_lordo)} · tasse {euro(o.tasse)}{o.nota ? ` · ${o.nota}` : ''}
                    </span>
                  </span>
                  <span className="importo incasso">+{euro(o.importo_netto)}</span>
                </button>
              )
            const lordo = Number(o.quantita) * Number(o.prezzo) * fattore(a)
            return (
              <button key={o.id} className="movimento" onClick={() => setModulo({ tipo: o.tipo, operazione: o })}>
                <span className="movimento-testo">
                  <strong>{o.tipo === 'acquisto' ? 'Acquisto' : 'Vendita'} · {a?.nome}</strong>
                  <span className="nota">
                    {dataBreve(o.data)} · {mostraQuantita(a, o.quantita)} a {mostraPrezzo(a, o.prezzo)}
                    {Number(o.spese) > 0 && ` · spese ${euro(o.spese)}`}
                    {o.movimenta_liquidita === false && " · fuori liquidità"}
                    {o.da_verificare && <span className="etichetta attenzione">da verificare</span>}
                  </span>
                  {o.tipo === 'vendita' && (
                    <span className="nota">
                      {Number(o.plusvalore) >= 0 ? 'Plusvalore' : 'Minusvalenza'} {euro(o.plusvalore)} · tasse {euro(o.tasse)}
                    </span>
                  )}
                </span>
                <span className={`importo ${o.movimenta_liquidita === false ? '' : o.tipo === 'acquisto' ? 'spesa' : 'incasso'}`}>
                  {o.movimenta_liquidita === false
                    ? euro(o.tipo === 'acquisto' ? lordo + Number(o.spese) : o.liquidita_incassata)
                    : o.tipo === 'acquisto' ? `−${euro(lordo + Number(o.spese))}` : `+${euro(o.liquidita_incassata)}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
