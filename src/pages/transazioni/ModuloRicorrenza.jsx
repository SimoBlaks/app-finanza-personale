import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, inCentesimi, leggiImporto, leggiNumero, perCampo } from '../../lib/numeri'
import { frequenze } from '../../lib/date'
import { tipiTransazione } from '../../lib/scorciatoie'
import SceltaCategoria from '../../components/SceltaCategoria'

// Modifica di una ricorrenza: cambia le transazioni che il job creerà da qui in avanti,
// non quelle già create (vedi DECISIONI.md).
export default function ModuloRicorrenza({ ricorrenza: r, albero, persone, onFine }) {
  const [f, setF] = useState({
    tipo: r.tipo,
    importo: perCampo(r.importo_totale),
    nota: r.nota ?? '',
    categoria: { macroId: r.macrocategoria_id, catId: r.categoria_id, microId: r.microcategoria_id },
    condivisa: r.condivisa,
    pagata_da: r.pagata_da ?? 'io',
    persona_id: r.persona_id ?? '',
    percentuale_mia: r.percentuale_mia != null ? perCampo(r.percentuale_mia) : '50',
    frequenza: r.frequenza,
    prossima_scadenza: r.prossima_scadenza,
    fine_ricorrenza: r.fine_ricorrenza ?? '',
  })
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const imposta = (campo, valore) =>
    setF((x) => ({ ...x, [campo]: valore, ...(campo === 'tipo' && valore === 'incasso' ? { condivisa: false } : {}) }))

  const importo = leggiImporto(f.importo)
  const percentuale = leggiNumero(f.percentuale_mia, 2)
  const anteprimaQuota =
    importo && percentuale && Number(importo) > 0 ? euro(Math.round((inCentesimi(importo) * Number(percentuale)) / 100) / 100) : null

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    if (!importo || Number(importo) <= 0) return setErrore('Inserisci un importo maggiore di zero, con al massimo 2 decimali.')
    if (!f.categoria.macroId) return setErrore('Scegli almeno la macrocategoria.')
    if (!f.prossima_scadenza) return setErrore('Indica la prossima scadenza.')
    if (f.fine_ricorrenza && f.fine_ricorrenza < f.prossima_scadenza)
      return setErrore('La fine della ricorrenza non può essere prima della prossima scadenza.')
    if (f.condivisa) {
      if (!f.persona_id) return setErrore('Scegli con chi dividere la spesa.')
      if (percentuale === null || Number(percentuale) < 0 || Number(percentuale) > 100)
        return setErrore('La tua percentuale deve essere tra 0 e 100.')
    }
    const dati = {
      tipo: f.tipo,
      importo_totale: importo,
      nota: f.nota.trim() || null,
      macrocategoria_id: f.categoria.macroId,
      categoria_id: f.categoria.catId || null,
      microcategoria_id: f.categoria.microId || null,
      condivisa: f.condivisa,
      pagata_da: f.condivisa ? f.pagata_da : null,
      persona_id: f.condivisa ? f.persona_id : null,
      percentuale_mia: f.condivisa ? percentuale : null,
      frequenza: f.frequenza,
      prossima_scadenza: f.prossima_scadenza,
      fine_ricorrenza: f.fine_ricorrenza || null,
    }
    // cambiando la data, il suo giorno diventa quello di riferimento (es. 31 → ultimo giorno dei mesi corti);
    // altrimenti resta quello di prima (una scadenza al 30/11 di una ricorrenza "al 31" non lo cambia)
    if (f.prossima_scadenza !== r.prossima_scadenza) dati.giorno_riferimento = Number(f.prossima_scadenza.slice(8, 10))
    setInvio(true)
    const { error } = await supabase.from('transazioni_ricorrenti').update(dati).eq('id', r.id)
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  const personeScelta = persone.filter((p) => p.attiva || p.id === f.persona_id)

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>Modifica ricorrenza</h2>
      <p className="nota">Le modifiche valgono per le prossime transazioni create in automatico; quelle già create restano come sono.</p>
      <div className="interruttore-tipo" role="radiogroup">
        {Object.entries(tipiTransazione).map(([t, etichetta]) => (
          <button type="button" key={t} className={f.tipo === t ? `selezionato ${t}` : ''} onClick={() => imposta('tipo', t)}>{etichetta}</button>
        ))}
      </div>
      <div className="griglia">
        <label>Importo (€)<input inputMode="decimal" value={f.importo} onChange={(e) => imposta('importo', e.target.value)} /></label>
        <label>Nota<input value={f.nota} onChange={(e) => imposta('nota', e.target.value)} placeholder="Descrizione (facoltativa)" /></label>
      </div>
      <div>
        <span className="etichetta-campo">Categoria</span>
        <SceltaCategoria albero={albero} valore={f.categoria} onChange={(v) => imposta('categoria', v)} />
      </div>

      {f.tipo === 'spesa' && (
        <label className="interruttore">
          <input type="checkbox" checked={f.condivisa} onChange={(e) => imposta('condivisa', e.target.checked)} />
          Spesa condivisa
        </label>
      )}
      {f.condivisa && (
        <div className="riquadro">
          <div className="griglia">
            <label>
              Chi paga
              <select value={f.pagata_da} onChange={(e) => imposta('pagata_da', e.target.value)}>
                <option value="io">Io</option>
                <option value="persona">L'altra persona</option>
              </select>
            </label>
            <label>
              Con chi dividere
              <select value={f.persona_id} onChange={(e) => imposta('persona_id', e.target.value)}>
                <option value="">Scegli…</option>
                {personeScelta.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label>La mia percentuale (%)<input inputMode="decimal" value={f.percentuale_mia} onChange={(e) => imposta('percentuale_mia', e.target.value)} /></label>
          </div>
          {anteprimaQuota && <p className="nota">La tua quota: <strong>{anteprimaQuota}</strong></p>}
        </div>
      )}

      <div className="riquadro griglia">
        <label>
          Frequenza
          <select value={f.frequenza} onChange={(e) => imposta('frequenza', e.target.value)}>
            {Object.entries(frequenze).map(([v, { etichetta }]) => <option key={v} value={v}>{etichetta}</option>)}
          </select>
        </label>
        <label>Prossima scadenza<input type="date" value={f.prossima_scadenza} onChange={(e) => imposta('prossima_scadenza', e.target.value)} /></label>
        <label>Fine ricorrenza (facoltativa)<input type="date" value={f.fine_ricorrenza} onChange={(e) => imposta('fine_ricorrenza', e.target.value)} /></label>
      </div>

      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}
