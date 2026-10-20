import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { useConferma } from '../../components/Conferma'
import { euro, inCentesimi, leggiNumero, oggiISO } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'

// Rettifiche di liquidità: allineano la liquidità dell'app al saldo reale dei conti.
// Si scrive il saldo reale di oggi e l'app registra la differenza (non è né spesa né entrata).
export default function AllineaLiquidita() {
  const [liquidita, setLiquidita] = useState(null)
  const [rettifiche, setRettifiche] = useState([])
  const [saldo, setSaldo] = useState('')
  const [nota, setNota] = useState('Allineamento al saldo dei conti')
  const [messaggio, setMessaggio] = useState({ testo: '', errore: false })
  const [invio, setInvio] = useState(false)
  const conferma = useConferma()

  const carica = useCallback(async () => {
    const [l, r] = await Promise.all([
      supabase.from('liquidita').select('liquidita').maybeSingle(),
      supabase.from('rettifiche_liquidita').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }),
    ])
    if (l.error || r.error) return setMessaggio({ testo: messaggioErrore(l.error || r.error), errore: true })
    setLiquidita(l.data ? l.data.liquidita : null)
    setRettifiche(r.data)
  }, [])

  useEffect(() => { carica() }, [carica])

  const reale = leggiNumero(saldo)
  // differenza in centesimi, per non avere errori di arrotondamento
  const differenza = reale !== null && liquidita !== null ? (inCentesimi(reale) - inCentesimi(String(liquidita))) / 100 : null

  async function registra(e) {
    e.preventDefault()
    setMessaggio({ testo: '', errore: false })
    if (reale === null) return setMessaggio({ testo: 'Scrivi il saldo reale di oggi.', errore: true })
    if (!differenza) return setMessaggio({ testo: 'La liquidità coincide già con il saldo reale: nessuna rettifica da registrare.', errore: false })
    const ok = await conferma({
      titolo: `Registrare una rettifica di ${differenza > 0 ? '+' : '−'}${euro(Math.abs(differenza))}?`,
      messaggio: `La liquidità passerà da ${euro(liquidita)} a ${euro(reale)}. Spese ed entrate non cambiano.`,
      conferma: 'Registra',
    })
    if (!ok) return
    setInvio(true)
    const { error } = await supabase.from('rettifiche_liquidita').insert({ data: oggiISO(), importo: differenza.toFixed(2), nota: nota.trim() || null })
    setInvio(false)
    if (error) return setMessaggio({ testo: messaggioErrore(error), errore: true })
    setSaldo('')
    setMessaggio({ testo: 'Rettifica registrata.', errore: false })
    carica()
  }

  async function elimina(r) {
    if (!(await conferma({ titolo: 'Eliminare questa rettifica?', messaggio: `La liquidità cambierà di ${euro(-Number(r.importo))}.`, conferma: 'Elimina', pericolo: true }))) return
    const { error } = await supabase.from('rettifiche_liquidita').delete().eq('id', r.id)
    if (error) return setMessaggio({ testo: messaggioErrore(error), errore: true })
    setMessaggio({ testo: 'Rettifica eliminata.', errore: false })
    carica()
  }

  return (
    <form className="scheda modulo" onSubmit={registra}>
      <h2>Allinea la liquidità ai conti</h2>
      <p className="nota">
        Se la liquidità dell'app non coincide con quello che hai davvero (conti, carte, contanti) e non trovi la differenza,
        scrivi qui il saldo reale di oggi: l'app registra la differenza come rettifica. Non è né una spesa né un'entrata.
      </p>
      <dl className="dati">
        <dt>Liquidità secondo l'app oggi</dt>
        <dd>{liquidita === null ? '—' : euro(liquidita)}</dd>
      </dl>
      <div className="griglia">
        <label>Saldo reale di oggi (€)<input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} /></label>
        <label>Nota<input value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      </div>
      {differenza !== null && (
        <p className="nota">
          Differenza da registrare: <strong className={differenza < 0 ? 'importo spesa' : 'importo incasso'}>{differenza > 0 ? '+' : differenza < 0 ? '−' : ''}{euro(Math.abs(differenza))}</strong>
        </p>
      )}
      {messaggio.testo && <p className={messaggio.errore ? 'errore' : 'successo'}>{messaggio.testo}</p>}
      <div className="azioni-modulo">
        <button className="primario" disabled={invio || liquidita === null}>{invio ? 'Salvataggio…' : 'Registra rettifica'}</button>
      </div>

      {rettifiche.length > 0 && (
        <>
          <h3>Rettifiche registrate</h3>
          <div className="elenco-movimenti">
            {rettifiche.map((r) => (
              <div key={r.id} className="movimento statico">
                <span className="movimento-testo">
                  <strong>{r.nota || 'Rettifica'}</strong>
                  <span className="nota">{dataBreve(r.data)}</span>
                </span>
                <span className={`importo ${Number(r.importo) < 0 ? 'spesa' : 'incasso'}`}>{Number(r.importo) > 0 ? '+' : '−'}{euro(Math.abs(Number(r.importo)))}</span>
                <button type="button" className="piccolo pericolo" onClick={() => elimina(r)}>Elimina</button>
              </div>
            ))}
          </div>
        </>
      )}
    </form>
  )
}
