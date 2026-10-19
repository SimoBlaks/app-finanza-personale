import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, numero } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'
import { fattore, mostraPrezzo, mostraQuantita } from '../../lib/investimenti'
import ModuloOperazione from './ModuloOperazione'

export default function Investimenti() {
  const [asset, setAsset] = useState(null)
  const [posizioni, setPosizioni] = useState([])
  const [operazioni, setOperazioni] = useState([])
  const [modulo, setModulo] = useState(null) // { tipo: 'acquisto' | 'vendita', operazione }
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const [a, p, o] = await Promise.all([
      supabase.from('asset').select('*').order('nome'),
      supabase.from('posizioni').select('*'),
      supabase.from('operazioni_investimento').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }),
    ])
    const err = a.error || p.error || o.error
    if (err) return setErrore(messaggioErrore(err))
    setAsset(a.data)
    setPosizioni(p.data)
    setOperazioni(o.data)
  }, [])

  useEffect(() => { carica() }, [carica])

  if (!asset) return <section><h1>Investimenti</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  const perId = Object.fromEntries(asset.map((a) => [a.id, a]))
  const possedute = posizioni.filter((p) => Number(p.quantita) > 0)

  if (modulo)
    return (
      <section>
        <ModuloOperazione
          tipo={modulo.tipo}
          operazione={modulo.operazione}
          asset={asset}
          posizioni={posizioni}
          onFine={() => { setModulo(null); carica() }}
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

      <h2>Posizioni</h2>
      {!possedute.length && <p className="nota">Nessun asset posseduto.</p>}
      <div className="griglia-posizioni">
        {possedute.map((p) => {
          const a = perId[p.asset_id]
          return (
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
                <dt>Costo di carico</dt>
                <dd>{euro(p.costo_carico)}</dd>
              </dl>
              <p className="nota">Valore attuale e guadagno arriveranno con i prezzi (passo 5b).</p>
            </div>
          )
        })}
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
