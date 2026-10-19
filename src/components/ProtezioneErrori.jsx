import { Component } from 'react'

// Se una pagina va in errore mostra un messaggio invece di lasciare lo schermo bianco.
export default class ProtezioneErrori extends Component {
  state = { errore: null }

  static getDerivedStateFromError(errore) {
    return { errore }
  }

  render() {
    if (!this.state.errore) return this.props.children
    return (
      <div className="scheda">
        <h2>Qualcosa è andato storto</h2>
        <p className="nota">La pagina non si è caricata correttamente. Prova a ricaricarla.</p>
        <p className="errore">{String(this.state.errore.message || this.state.errore)}</p>
        <button className="primario" onClick={() => window.location.reload()}>Ricarica</button>
      </div>
    )
  }
}
