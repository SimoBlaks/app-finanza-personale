import { useState } from 'react'

// Riga di un elenco con rinomina, archivia/ripristina ed elimina.
// onRinomina, onArchivia e onElimina restituiscono un messaggio d'errore oppure ''.
export default function RigaVoce({ nome, attiva, onRinomina, onArchivia, onElimina, prima, dopo }) {
  const [modifica, setModifica] = useState(false)
  const [valore, setValore] = useState(nome)
  const [errore, setErrore] = useState('')

  async function esegui(azione) {
    setErrore('')
    const msg = await azione()
    if (msg) setErrore(msg)
    return !msg
  }

  async function salva(e) {
    e.preventDefault()
    if (!valore.trim() || valore.trim() === nome) return setModifica(false)
    if (await esegui(() => onRinomina(valore.trim()))) setModifica(false)
  }

  return (
    <div className={`riga-voce ${attiva ? '' : 'archiviata'}`}>
      <div className="riga-principale">
        {prima}
        {modifica ? (
          <form className="riga-modifica" onSubmit={salva}>
            <input autoFocus value={valore} onChange={(e) => setValore(e.target.value)} />
            <button className="piccolo primario">Salva</button>
            <button type="button" className="piccolo" onClick={() => { setValore(nome); setModifica(false) }}>Annulla</button>
          </form>
        ) : (
          <>
            <span className="riga-nome">
              {nome}
              {!attiva && <span className="etichetta">archiviata</span>}
            </span>
            <span className="riga-azioni">
              <button className="piccolo" onClick={() => setModifica(true)}>Rinomina</button>
              <button className="piccolo" onClick={() => esegui(onArchivia)}>{attiva ? 'Archivia' : 'Ripristina'}</button>
              <button
                className="piccolo pericolo"
                onClick={() => window.confirm(`Eliminare "${nome}"?`) && esegui(onElimina)}
              >
                Elimina
              </button>
            </span>
          </>
        )}
      </div>
      {errore && <p className="errore">{errore}</p>}
      {dopo}
    </div>
  )
}
