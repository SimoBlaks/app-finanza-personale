// Gli importi viaggiano verso il database come stringhe ("1234.56"), così Postgres
// li salva in numeric senza passare dai float di JavaScript.

// Converte un testo scritto dall'utente in una stringa decimale con il punto ("1234.56").
// Sia la virgola sia il punto valgono come separatore dei decimali ("12,5" e "12.5" sono uguali,
// vedi DECISIONI.md). Se compaiono entrambi ("1.234,56") l'ultimo è il decimale e gli altri
// sono separatori delle migliaia; lo stesso se uno compare più volte ("1.234.567").
// decimali: quante cifre dopo la virgola sono ammesse. Restituisce null se non è un numero valido.
export function leggiNumero(testo, decimali = 6) {
  if (testo === null || testo === undefined) return null
  let s = String(testo).trim().replace(/\s|€/g, '')
  if (s === '') return null
  const separatori = s.match(/[.,]/g) ?? []
  if (separatori.length > 1) {
    const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
    const uguali = separatori.every((c) => c === separatori[0])
    // "1.234.567": tutte migliaia; "1.234,56": l'ultimo è il decimale
    s = uguali ? s.replace(/[.,]/g, '') : s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1)
  } else s = s.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  if ((s.split('.')[1] ?? '').length > decimali) return null
  return s
}

// Importo in euro: al massimo 2 decimali.
export const leggiImporto = (testo) => leggiNumero(testo, 2)

// Converte una stringa decimale in centesimi interi (per somme esatte).
export function inCentesimi(decimale) {
  const [interi, decimali = ''] = decimale.replace('-', '').split('.')
  const c = Number(interi) * 100 + Number((decimali + '00').slice(0, 2))
  return decimale.startsWith('-') ? -c : c
}

const formatoEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' })
const formatoNumero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6, useGrouping: 'always' })

export const euro = (n) => formatoEuro.format(Number(n ?? 0))
export const numero = (n) => formatoNumero.format(Number(n ?? 0))

// Mostra un valore numerico del database nel formato italiano per un campo di testo.
export const perCampo = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

export const oggiISO = () => {
  const d = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
