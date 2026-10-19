import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, numero } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'
import { fattore, mostraPrezzo, mostraQuantita } from '../../lib/investimenti'
import { caricaImpostazioni, caricaUltimiPrezzi, valuta } from '../../lib/prezzi'
import ModuloOperazione from './ModuloOperazione'
import AggiornaPrezzi from './AggiornaPrezzi'

const percento = (n) => `${n > 0 ? '+' : ''}${numero(n.toFixed(2))}%`

export default function Investimenti() {
  const [asset, setAsset] = useState(null)
  const [posizioni, setPosizioni] = useState([])
  const [operazioni, setOperazioni] = useState([])
  const [ultimi, setUltimi] = useState({})
  const [impostazioni, setImpostazioni] = useState(null)
  const [modulo, setModulo] = useState(null) // { tipo: 'acquisto' | 'vendita' | 'prezzi', operazione }
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const [a, p, o, u, i] = await Promise.all([
      supabase.from('asset').select('*').order('nome'),
      supabase.from('posizioni').select('*'),
      supabase.from('operazioni_investimento').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }),
      caricaUltimiPrezzi(),
      caricaImpostazioni(),
    ])
    const err = a.error || p.error || o.error || u.error || i.error
    if (err) return setErrore(messaggioErrore(err))
    setAsset(a.data)
    setPosizioni(p.data)
    setOperazioni(o.data)
    setUltimi(u.ultimi)
    setImpostazioni(i.impostazioni)
  }, [])

  useEffect(() => { carica() }, [carica])

  if (!asset) return <section><h1>Investimenti</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  const perId = Object.fromEntries(asset.map((a) => [a.id, a]))
  const possedute = posizioni.filter((p) => Number(p.quantita) > 0)

  const chiudi = () => { setModulo(null); carica() }

  if (modulo?.tipo === 'prezzi')
    return (
      <section>
        <AggiornaPrezzi asset={asset} posizioni={posizioni} ultimi={ultimi} impostazioni={impostazioni} onFine={chiudi} />
      </section>
    )

  const valutazioni = possedute.map((p) => ({ p, a: perId[p.asset_id], v: valuta(perId[p.asset_id], p, ultimi[p.asset_id], impostazioni) }))
  const totale = valutazioni.reduce(
    (t, { p, v }) => ({ valore: t.valore + v.valore, costo: t.costo + Number(p.costo_carico) }),
    { valore: 0, costo: 0 },
  )

  if (modulo)
    return (
      <section>
        <ModuloOperazione
          tipo={modulo.tipo}
          operazione={modulo.operazione}
          asset={asset}
          posizioni={posizioni}
          onFine={chiudi}
        />
      </section>
    )

  return (
    <section>
      <h1>Investimenti</h1>
      <div className="azioni-pagina">
        <button className="primario" onClick={() => setModulo({ tipo: 'acquisto', operazione: null })}>+ Nuovo acquisto</button>
        <button onClick={() => setModulo({ tipo: 'vendita', operazione: null })} disabled={!possedute.length}>Vendita</button>
      </div>
      {!asset.length && <p className="nota">Aggiungi prima gli asset in Impostazioni → Asset.</p>}
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
      <div className="griglia-posizioni">
        {valutazioni.map(({ p, a, v }) => (
          <div key={p.asset_id} className="scheda posizione">
            <div className="posizione-titolo">
              <strong>{a?.nome}</strong>
              <span className="nota">{a?.ticker_isin}</span>
            </div>
            <dl className="dati">
              <dt>{a?.quotazione === 'percentuale' ? 'Nominale' : 'Quantità'}</dt>
              <dd>{a?.quotazione === 'percentuale' ? euro(p.quantita) : numero(p.quantita)}</dd>
              <dt>PMC</dt>
              <dd>{mostraPrezzo(a, p.pmc)}</dd>
              <dt>Ultimo prezzo</dt>
              <dd>
                {v.senzaPrezzo ? '—' : mostraPrezzo(a, v.prezzo)}
                {v.dataPrezzo && <span className="nota"> del {dataBreve(v.dataPrezzo)}</span>}
              </dd>
              <dt>Valore attuale</dt>
              <dd>{euro(v.valore)}</dd>
              <dt>Guadagno / perdita</dt>
              <dd className={v.guadagno >= 0 ? 'ok' : 'perdita'}>{euro(v.guadagno)} ({percento(v.guadagnoPct)})</dd>
            </dl>
            {v.senzaPrezzo && <p className="etichetta-avviso">nessun prezzo disponibile: valore calcolato al PMC</p>}
            {v.prezzoVecchio && <p className="etichetta-avviso">prezzo vecchio</p>}
          </div>
        ))}
      </div>

      <h2>Cronologia operazioni</h2>
      {!operazioni.length && <p className="nota">Nessuna operazione registrata.</p>}
      {operazioni.length > 0 && (
        <div className="scheda elenco-movimenti">
          {operazioni.map((o) => {
            const a = perId[o.asset_id]
            const lordo = Number(o.quantita) * Number(o.prezzo) * fattore(a)
            return (
              <button key={o.id} className="movimento" onClick={() => setModulo({ tipo: o.tipo, operazione: o })}>
                <span className="movimento-testo">
                  <strong>{o.tipo === 'acquisto' ? 'Acquisto' : 'Vendita'} · {a?.nome}</strong>
                  <span className="nota">
                    {dataBreve(o.data)} · {mostraQuantita(a, o.quantita)} a {mostraPrezzo(a, o.prezzo)}
                    {Number(o.spese) > 0 && ` · spese ${euro(o.spese)}`}
                  </span>
                  {o.tipo === 'vendita' && (
                    <span className="nota">
                      {Number(o.plusvalore) >= 0 ? 'Plusvalore' : 'Minusvalenza'} {euro(o.plusvalore)} · tasse {euro(o.tasse)}
                    </span>
                  )}
                </span>
                <span className={`importo ${o.tipo === 'acquisto' ? 'spesa' : 'incasso'}`}>
                  {o.tipo === 'acquisto' ? `−${euro(lordo + Number(o.spese))}` : `+${euro(o.liquidita_incassata)}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
