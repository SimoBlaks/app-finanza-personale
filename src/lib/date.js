export const frequenze = {
  mensile: { etichetta: 'Mensile', mesi: 1 },
  bimestrale: { etichetta: 'Bimestrale', mesi: 2 },
  semestrale: { etichetta: 'Semestrale', mesi: 6 },
  annuale: { etichetta: 'Annuale', mesi: 12 },
}

const pad = (x) => String(x).padStart(2, '0')

// Aggiunge n mesi a una data ISO; se il giorno non esiste (31 → febbraio) usa l'ultimo del mese.
export function aggiungiMesi(iso, n) {
  const [a, m, g] = iso.split('-').map(Number)
  const totale = a * 12 + (m - 1) + n
  const anno = Math.floor(totale / 12)
  const mese = (totale % 12) + 1
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  return `${anno}-${pad(mese)}-${pad(Math.min(g, ultimo))}`
}

// Aggiunge (o toglie, se negativo) n giorni a una data ISO.
export function aggiungiGiorni(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Primo e ultimo giorno di un mese ("2026-10") in ISO.
export function limitiMese(annoMese) {
  const [a, m] = annoMese.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { da: `${annoMese}-01`, a: `${annoMese}-${pad(ultimo)}` }
}

export const meseCorrente = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function spostaMese(annoMese, n) {
  return aggiungiMesi(`${annoMese}-01`, n).slice(0, 7)
}

export const nomeMese = (annoMese) =>
  new Date(`${annoMese}-15T12:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

export const dataEstesa = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })

export const dataBreve = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT')
