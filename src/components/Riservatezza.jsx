import { useSyncExternalStore } from 'react'

// Modalità riservata: sfoca gli importi in dashboard per chi guarda lo schermo.
// La scelta vale solo su questo dispositivo (memoria del browser), non nel database.
const CHIAVE = 'cifre-nascoste'
const ascoltatori = new Set()

function leggi() {
  try {
    return localStorage.getItem(CHIAVE) === 'si'
  } catch {
    return false
  }
}

function applica(nascoste) {
  document.documentElement.classList.toggle('cifre-nascoste', nascoste)
}

applica(leggi())

export function impostaCifreNascoste(nascoste) {
  try {
    localStorage.setItem(CHIAVE, nascoste ? 'si' : 'no')
  } catch {
    // memoria non disponibile (es. navigazione privata): vale fino alla chiusura della pagina
  }
  applica(nascoste)
  ascoltatori.forEach((f) => f())
}

function iscrivi(f) {
  ascoltatori.add(f)
  return () => ascoltatori.delete(f)
}

export const useCifreNascoste = () =>
  useSyncExternalStore(iscrivi, () => document.documentElement.classList.contains('cifre-nascoste'))

export default function InterruttoreCifre({ etichetta = 'Nascondi cifre' }) {
  const nascoste = useCifreNascoste()
  return (
    <label className="interruttore-cifre">
      <input type="checkbox" role="switch" checked={nascoste} onChange={(e) => impostaCifreNascoste(e.target.checked)} />
      <span className="levetta" aria-hidden="true" />
      <span>{etichetta}</span>
    </label>
  )
}
