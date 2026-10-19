import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, inCentesimi, leggiNumero, oggiISO, perCampo } from '../../lib/numeri'
import { aggiungiMesi, frequenze } from '../../lib/date'
import SceltaCategoria from '../../components/SceltaCategoria'

function statoIniziale(t) {
  const data = t?.data ?? oggiISO()
  return {
    id: t?.id ?? null,
    tipo: t?.tipo ?? 'spesa',
    data,
    importo: t ? perCampo(t.importo_totale) : '',
    nota: t?.nota ?? '',
    categoria: t ? { macroId: t.macrocategoria_id, catId: t.categoria_id, microId: t.microcategoria_id } : {},
    condivisa: t?.condivisa ?? false,
    pagata_da: t?.pagata_da ?? 'io',
    persona_id: t?.persona_id ?? '',
    percentuale_mia: t?.percentuale_mia != null ? perCampo(t.percentuale_mia) : '50',
    ricorrente: false,
    frequenza: 'mensile',
    prossima_scadenza: aggiungiMesi(data, 1),
    scadenza_modificata: false,
    fine_ricorrenza: '',
  }
}

export default function ModuloTransazione({ albero, persone, transazione, onFine }) {
  const [f, setF] = useState(() => statoIniziale(transazione))
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const nuova = !f.id

  // Finché l'utente non tocca la prossima scadenza, la teniamo allineata a data + frequenza.
  const imposta = (campo, valore) =>
    setF((x) => {
      const y = { ...x, [campo]: valore }
      if (campo === 'tipo' && valore === 'incasso') y.condivisa = false
      if ((campo === 'data' || campo === 'frequenza') && !x.scadenza_modificata && y.data)
        y.prossima_scadenza = aggiungiMesi(y.data, frequenze[y.frequenza].mesi)
      if (campo === 'prossima_scadenza') y.scadenza_modificata = true
      return y
    })

  const importo = leggiNumero(f.importo)
  const percentuale = leggiNumero(f.percentuale_mia)
  const anteprimaQuota =
    importo && percentuale && Number(importo) > 0 ? euro(Math.round((inCentesimi(importo) * Number(percentuale)) / 100) / 100) : null

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    if (!f.data) return setErrore('Indica la data.')
    if (!importo || Number(importo) <= 0) return setErrore('Inserisci un importo maggiore di zero.')
    if (!f.categoria.macroId) return setErrore('Scegli almeno la macrocategoria.')
    if (f.condivisa) {
      if (!f.persona_id) return setErrore('Scegli con chi dividere la spesa.')
      if (percentuale === null || Number(percentuale) < 0 || Number(percentuale) > 100)
        return setErrore('La tua percentuale deve essere tra 0 e 100.')
    }
    if (nuova && f.ricorrente) {
      if (!f.prossima_scadenza || f.prossima_scadenza <= f.data)
        return setErrore('La prossima scadenza deve essere successiva alla data della transazione.')
      if (f.fine_ricorrenza && f.fine_ricorrenza < f.prossima_scadenza)
        return setErrore('La fine della ricorrenza non può essere prima della prossima scadenza.')
    }

    const dati = {
      data: f.data,
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
    }

    setInvio(true)
    const { error } = nuova
      ? f.ricorrente
        ? await supabase.rpc('crea_ricorrenza', {
            p_transazione: dati,
            p_frequenza: f.frequenza,
            p_prossima_scadenza: f.prossima_scadenza,
            p_fine_ricorrenza: f.fine_ricorrenza || null,
          })
        : await supabase.from('transazioni').insert(dati)
      : await supabase.from('transazioni').update(dati).eq('id', f.id)
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  async function elimina() {
    if (!window.confirm('Eliminare questa transazione?')) return
    const { error } = await supabase.from('transazioni').delete().eq('id', f.id)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  const personeScelta = persone.filter((p) => p.attiva || p.id === f.persona_id)

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>{nuova ? 'Nuova transazione' : 'Modifica transazione'}</h2>

      <div className="interruttore-tipo" role="radiogroup">
        {['spesa', 'incasso'].map((t) => (
          <button type="button" key={t} className={f.tipo === t ? `selezionato ${t}` : ''} onClick={() => imposta('tipo', t)}>
            {t === 'spesa' ? 'Spesa' : 'Incasso'}
          </button>
        ))}
      </div>

      <div className="griglia">
        <label>Importo (€)<input inputMode="decimal" value={f.importo} onChange={(e) => imposta('importo', e.target.value)} autoFocus={nuova} /></label>
        <label>Data<input type="date" value={f.data} onChange={(e) => imposta('data', e.target.value)} /></label>
      </div>
      <label>Nota<input value={f.nota} onChange={(e) => imposta('nota', e.target.value)} placeholder="Descrizione (facoltativa)" /></label>

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
              Chi ha pagato
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
          {!personeScelta.length && <p className="nota">Aggiungi prima una persona in Impostazioni → Persone.</p>}
          {anteprimaQuota && <p className="nota">La tua quota: <strong>{anteprimaQuota}</strong></p>}
        </div>
      )}

      {nuova && (
        <label className="interruttore">
          <input type="checkbox" checked={f.ricorrente} onChange={(e) => imposta('ricorrente', e.target.checked)} />
          Rendi ricorrente
        </label>
      )}
      {nuova && f.ricorrente && (
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
      )}
      {!nuova && transazione?.ricorrenza_id && (
        <p className="nota">Generata da una ricorrenza: le modifiche valgono solo per questa occorrenza.</p>
      )}

      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        {!nuova && <button type="button" className="pericolo" onClick={elimina}>Elimina</button>}
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}
