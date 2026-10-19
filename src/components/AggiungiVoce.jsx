import { useState } from 'react'

// Piccolo modulo "nome + Aggiungi". onAggiungi restituisce un messaggio d'errore oppure ''.
export default function AggiungiVoce({ segnaposto, onAggiungi }) {
  const [nome, setNome] = useState('')
  const [errore, setErrore] = useState('')

  async function invia(e) {
    e.preventDefault()
    if (!nome.trim()) return
    setErrore('')
    const msg = await onAggiungi(nome.trim())
    if (msg) setErrore(msg)
    else setNome('')
  }

  return (
    <form className="aggiungi-voce" onSubmit={invia}>
      <div className="riga-modifica">
        <input placeholder={segnaposto} value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="piccolo primario">Aggiungi</button>
      </div>
      {errore && <p className="errore">{errore}</p>}
    </form>
  )
}
