import { useSyncExternalStore } from 'react'

// Tema dell'app: automatico (segue il telefono), chiaro o scuro.
// La scelta vale solo su questo dispositivo (memoria del browser), non nel database.
const CHIAVE = 'tema'
const scelte = { automatico: 'Automatico', chiaro: 'Chiaro', scuro: 'Scuro' }
const ascoltatori = new Set()

function leggi() {
  try {
    const v = localStorage.getItem(CHIAVE)
    return v in scelte ? v : 'automatico'
  } catch {
    return 'automatico'
  }
}

// data-tema su <html>: il foglio di stile sceglie i colori di conseguenza
function applica(tema) {
  if (tema === 'automatico') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = tema
}

applica(leggi())

function imposta(tema) {
  try {
    localStorage.setItem(CHIAVE, tema)
  } catch {
    // memoria non disponibile (es. navigazione privata): vale fino alla chiusura della pagina
  }
  applica(tema)
  ascoltatori.forEach((f) => f())
}

function iscrivi(f) {
  ascoltatori.add(f)
  return () => ascoltatori.delete(f)
}

const attuale = () => document.documentElement.dataset.tema ?? 'automatico'

export default function SceltaTema() {
  const tema = useSyncExternalStore(iscrivi, attuale)
  return (
    <div className="scelta-tema">
      <span className="etichetta-campo">Tema</span>
      <div className="interruttore-vista" role="group" aria-label="Tema">
        {Object.entries(scelte).map(([k, l]) => (
          <button key={k} type="button" className={tema === k ? 'attivo' : ''} aria-pressed={tema === k} onClick={() => imposta(k)}>{l}</button>
        ))}
      </div>
    </div>
  )
}
