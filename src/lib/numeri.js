// Gli importi viaggiano verso il database come stringhe ("1234.56"), così Postgres
// li salva in numeric senza passare dai float di JavaScript.

// Converte un testo scritto all'italiana ("1.234,56" o "1234,56" o "1234.56")
// in una stringa decimale con il punto. Restituisce null se non è un numero.
export function leggiNumero(testo) {
  if (testo === null || testo === undefined) return null
  let s = String(testo).trim().replace(/\s|€/g, '')
  if (s === '') return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  return s
}

// Converte una stringa decimale in centesimi interi (per somme esatte).
export function inCentesimi(decimale) {
  const [interi, decimali = ''] = decimale.replace('-', '').split('.')
  const c = Number(interi) * 100 + Number((decimali + '00').slice(0, 2))
  return decimale.startsWith('-') ? -c : c
}

const formatoEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const formatoNumero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 })

export const euro = (n) => formatoEuro.format(Number(n ?? 0))
export const numero = (n) => formatoNumero.format(Number(n ?? 0))

// Mostra un valore numerico del database nel formato italiano per un campo di testo.
export const perCampo = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

export const oggiISO = () => {
  const d = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
