import { useState } from 'react'
import { supabase } from '../../supabase'
import { useSessione } from '../../auth/Sessione'
import { messaggioErrore } from '../../lib/errori'
import { leggiNumero, numero, oggiISO } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'
import { mostraPrezzo } from '../../lib/investimenti'

// Inserimento manuale dei prezzi di chiusura (SPEC 6.2).
// Si salvano solo le righe compilate: i prezzi non toccati non ricevono una data nuova.
export default function AggiornaPrezzi({ asset, posizioni, ultimi, impostazioni, onFine }) {
  const sessione = useSessione()
  const possedute = posizioni
    .filter((p) => Number(p.quantita) > 0)
    .map((p) => asset.find((a) => a.id === p.asset_id))
    .filter(Boolean)
  const [righe, setRighe] = useState(() => Object.fromEntries(possedute.map((a) => [a.id, { prezzo: '', data: oggiISO() }])))
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const imposta = (id, campo, valore) => setRighe((r) => ({ ...r, [id]: { ...r[id], [campo]: valore } }))

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    const daSalvare = []
    const avvisi = []
    for (const a of possedute) {
      const r = righe[a.id]
      if (!r.prezzo.trim()) continue
      const prezzo = leggiNumero(r.prezzo)
      if (!prezzo || Number(prezzo) <= 0) return setErrore(`Prezzo non valido per ${a.nome}: deve essere maggiore di zero.`)
      if (!r.data) return setErrore(`Indica la data del prezzo per ${a.nome}.`)
      if (r.data > oggiISO()) return setErrore(`La data del prezzo di ${a.nome} è nel futuro.`)
      const ultimo = ultimi[a.id]
      if (ultimo) {
        const variazione = ((Number(prezzo) - Number(ultimo.prezzo_chiusura)) / Number(ultimo.prezzo_chiusura)) * 100
        if (Math.abs(variazione) > Number(impostazioni.soglia_avviso_prezzo_pct))
          avvisi.push(`${a.nome}: da ${mostraPrezzo(a, ultimo.prezzo_chiusura)} a ${mostraPrezzo(a, prezzo)} (${variazione > 0 ? '+' : ''}${numero(variazione.toFixed(1))}%)`)
      }
      daSalvare.push({ user_id: sessione.user.id, asset_id: a.id, data: r.data, prezzo_chiusura: prezzo, fonte: 'manuale' })
    }
    if (!daSalvare.length) return setErrore('Non hai inserito nessun prezzo.')
    if (
      avvisi.length &&
      !window.confirm(
        `Questi prezzi variano più del ${numero(impostazioni.soglia_avviso_prezzo_pct)}% rispetto all'ultimo salvato. ` +
          `Controlla virgola e punto.\n\n${avvisi.join('\n')}\n\nSalvare comunque?`,
      )
    )
      return

    setInvio(true)
    // un solo prezzo per asset e data: se c'è già, viene sovrascritto
    const { error } = await supabase.from('prezzi_storici').upsert(daSalvare, { onConflict: 'asset_id,data' })
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>Aggiorna prezzi</h2>
      <p className="nota">
        Inserisci il prezzo di chiusura più recente. Compila solo gli asset da aggiornare: gli altri restano invariati.
        Puoi anche indicare una data passata per completare lo storico.
      </p>
      {!possedute.length && <p className="nota">Nessun asset posseduto.</p>}
      {possedute.map((a) => {
        const ultimo = ultimi[a.id]
        return (
          <div key={a.id} className="riga-prezzo">
            <div>
              <strong>{a.nome}</strong> <span className="nota">{a.ticker_isin}</span>
              <div className="nota">
                {ultimo ? `Ultimo: ${mostraPrezzo(a, ultimo.prezzo_chiusura)} del ${dataBreve(ultimo.data)}` : 'Nessun prezzo salvato'}
              </div>
            </div>
            <div className="griglia">
              <label>
                {a.quotazione === 'percentuale' ? 'Nuovo prezzo (%)' : 'Nuovo prezzo (€)'}
                <input
                  inputMode="decimal"
                  placeholder={ultimo ? String(ultimo.prezzo_chiusura).replace('.', ',') : ''}
                  value={righe[a.id].prezzo}
                  onChange={(e) => imposta(a.id, 'prezzo', e.target.value)}
                />
              </label>
              <label>
                Data del prezzo
                <input type="date" max={oggiISO()} value={righe[a.id].data} onChange={(e) => imposta(a.id, 'data', e.target.value)} />
              </label>
            </div>
          </div>
        )
      })}
      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio || !possedute.length}>{invio ? 'Salvataggio…' : 'Salva prezzi'}</button>
      </div>
    </form>
  )
}
