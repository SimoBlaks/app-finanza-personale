import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { useConferma } from '../../components/Conferma'
import { euro, leggiNumero, numero, oggiISO, perCampo } from '../../lib/numeri'
import { etichettaPrezzo, etichettaQuantita, fattore, mostraPrezzo } from '../../lib/investimenti'

// Acquisto o vendita. I valori definitivi della vendita (plusvalore, tasse,
// liquidità) li calcola il database al salvataggio; qui c'è solo un'anteprima.
export default function ModuloOperazione({ tipo, operazione, asset, posizioni, onFine }) {
  const [f, setF] = useState({
    data: operazione?.data ?? oggiISO(),
    asset_id: operazione?.asset_id ?? '',
    quantita: operazione ? perCampo(operazione.quantita) : '',
    prezzo: operazione ? perCampo(operazione.prezzo) : '',
    spese: operazione ? perCampo(operazione.spese) : '',
  })
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const conferma = useConferma()
  const imposta = (campo, valore) => setF((x) => ({ ...x, [campo]: valore }))
  const vendita = tipo === 'vendita'

  const posizione = (id) => posizioni.find((p) => p.asset_id === id)
  // Quantità disponibile oggi; se modifico una vendita, la sua quantità torna disponibile.
  const disponibile = (id) => {
    const q = Number(posizione(id)?.quantita ?? 0)
    return operazione && operazione.tipo === 'vendita' && operazione.asset_id === id ? q + Number(operazione.quantita) : q
  }

  const scelte = vendita
    ? asset.filter((a) => disponibile(a.id) > 0 || a.id === f.asset_id)
    : asset.filter((a) => a.attivo || a.id === f.asset_id)
  const scelto = asset.find((a) => a.id === f.asset_id)

  const q = leggiNumero(f.quantita)
  const p = leggiNumero(f.prezzo)
  const s = leggiNumero(f.spese) ?? '0'
  const lordo = q && p ? Number(q) * Number(p) * fattore(scelto) : null

  let anteprima = null
  if (scelto && lordo !== null) {
    if (!vendita) {
      anteprima = <p className="nota">Costo totale: <strong>{euro(lordo + Number(s))}</strong></p>
    } else {
      const pmc = Number(posizione(scelto.id)?.pmc ?? 0)
      const carico = Number(q) * pmc * fattore(scelto)
      const plus = lordo - carico - Number(s)
      const tasse = Math.max(plus, 0) * (Number(operazione?.aliquota_applicata ?? scelto.aliquota_tassa) / 100)
      anteprima = (
        <dl className="dati riquadro">
          <dt>Valore venduto</dt><dd>{euro(lordo)}</dd>
          <dt>Valore di carico (PMC {mostraPrezzo(scelto, pmc)})</dt><dd>{euro(carico)}</dd>
          <dt>{plus >= 0 ? 'Plusvalore' : 'Minusvalenza'}</dt><dd>{euro(plus)}</dd>
          <dt>Tasse ({numero(operazione?.aliquota_applicata ?? scelto.aliquota_tassa)}%)</dt><dd>{euro(tasse)}</dd>
          <dt>Liquidità incassata</dt><dd><strong>{euro(lordo - Number(s) - tasse)}</strong></dd>
        </dl>
      )
    }
  }

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    if (!f.asset_id) return setErrore('Scegli l\'asset.')
    if (!f.data) return setErrore('Indica la data.')
    if (!q || Number(q) <= 0) return setErrore('La quantità deve essere maggiore di zero.')
    if (!p || Number(p) <= 0) return setErrore('Il prezzo deve essere maggiore di zero.')
    if (Number(s) < 0) return setErrore('Le spese non possono essere negative.')
    if (vendita && Number(q) > disponibile(f.asset_id))
      return setErrore(`Puoi vendere al massimo ${numero(disponibile(f.asset_id))}.`)

    const dati = { data: f.data, tipo, asset_id: f.asset_id, quantita: q, prezzo: p, spese: s }
    setInvio(true)
    const { error } = operazione
      ? await supabase.from('operazioni_investimento').update(dati).eq('id', operazione.id)
      : await supabase.from('operazioni_investimento').insert(dati)
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  async function elimina() {
    if (!(await conferma({ titolo: 'Eliminare questa operazione?', conferma: 'Elimina', pericolo: true }))) return
    const { error } = await supabase.from('operazioni_investimento').delete().eq('id', operazione.id)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>{operazione ? `Modifica ${vendita ? 'vendita' : 'acquisto'}` : vendita ? 'Vendita' : 'Nuovo acquisto'}</h2>
      <div className="griglia">
        <label>
          Asset
          <select value={f.asset_id} onChange={(e) => imposta('asset_id', e.target.value)}>
            <option value="">Scegli…</option>
            {scelte.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}{vendita ? ` (disponibili ${numero(disponibile(a.id))})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>Data<input type="date" value={f.data} onChange={(e) => imposta('data', e.target.value)} /></label>
        <label>{etichettaQuantita(scelto)}<input inputMode="decimal" value={f.quantita} onChange={(e) => imposta('quantita', e.target.value)} /></label>
        <label>{etichettaPrezzo(scelto)}<input inputMode="decimal" value={f.prezzo} onChange={(e) => imposta('prezzo', e.target.value)} /></label>
        <label>Spese dell'operazione (€, facoltative)<input inputMode="decimal" value={f.spese} onChange={(e) => imposta('spese', e.target.value)} /></label>
      </div>
      {!asset.length && <p className="nota">Aggiungi prima gli asset in Impostazioni → Asset.</p>}
      {anteprima}
      {vendita && anteprima && <p className="nota">Anteprima con il PMC di oggi: i valori definitivi li calcola il database al salvataggio.</p>}

      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        {operazione && <button type="button" className="pericolo" onClick={elimina}>Elimina</button>}
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}
