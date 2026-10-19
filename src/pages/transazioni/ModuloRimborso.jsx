import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { useConferma } from '../../components/Conferma'
import { leggiNumero, oggiISO, perCampo } from '../../lib/numeri'

// Pagamento di saldo con una persona: sposta la liquidità e il saldo con lei,
// ma non è né una spesa né un'entrata.
export default function ModuloRimborso({ persone, rimborso, onFine }) {
  const [f, setF] = useState({
    id: rimborso?.id ?? null,
    data: rimborso?.data ?? oggiISO(),
    persona_id: rimborso?.persona_id ?? '',
    importo: rimborso ? perCampo(rimborso.importo) : '',
    direzione: rimborso?.direzione ?? 'ricevuto',
    nota: rimborso?.nota ?? '',
  })
  const [errore, setErrore] = useState('')
  const conferma = useConferma()
  const imposta = (campo, valore) => setF((x) => ({ ...x, [campo]: valore }))

  async function salva(e) {
    e.preventDefault()
    const importo = leggiNumero(f.importo)
    if (!f.persona_id) return setErrore('Scegli la persona.')
    if (!importo || Number(importo) <= 0) return setErrore('Inserisci un importo maggiore di zero.')
    if (!f.data) return setErrore('Indica la data.')
    const dati = { data: f.data, persona_id: f.persona_id, importo, direzione: f.direzione, nota: f.nota.trim() || null }
    const { error } = f.id
      ? await supabase.from('pagamenti_saldo').update(dati).eq('id', f.id)
      : await supabase.from('pagamenti_saldo').insert(dati)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  async function elimina() {
    if (!(await conferma({ titolo: 'Eliminare questo rimborso?', conferma: 'Elimina', pericolo: true }))) return
    const { error } = await supabase.from('pagamenti_saldo').delete().eq('id', f.id)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  const personeScelta = persone.filter((p) => p.attiva || p.id === f.persona_id)

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>{f.id ? 'Modifica rimborso' : 'Registra rimborso'}</h2>
      <p className="nota">Per saldare un debito o un credito con una persona. Non conta come spesa né come entrata.</p>
      <div className="interruttore-tipo" role="radiogroup">
        <button type="button" className={f.direzione === 'ricevuto' ? 'selezionato incasso' : ''} onClick={() => imposta('direzione', 'ricevuto')}>Ho ricevuto</button>
        <button type="button" className={f.direzione === 'pagato' ? 'selezionato spesa' : ''} onClick={() => imposta('direzione', 'pagato')}>Ho pagato</button>
      </div>
      <div className="griglia">
        <label>
          Persona
          <select value={f.persona_id} onChange={(e) => imposta('persona_id', e.target.value)}>
            <option value="">Scegli…</option>
            {personeScelta.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label>Importo (€)<input inputMode="decimal" value={f.importo} onChange={(e) => imposta('importo', e.target.value)} /></label>
        <label>Data<input type="date" value={f.data} onChange={(e) => imposta('data', e.target.value)} /></label>
        <label>Nota<input value={f.nota} onChange={(e) => imposta('nota', e.target.value)} /></label>
      </div>
      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        {f.id && <button type="button" className="pericolo" onClick={elimina}>Elimina</button>}
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario">Salva</button>
      </div>
    </form>
  )
}
