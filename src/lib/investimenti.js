import { euro, numero } from './numeri'

// Le obbligazioni sono quotate in % del nominale: valore = quantità × prezzo / 100.
export const fattore = (asset) => (asset?.quotazione === 'percentuale' ? 0.01 : 1)

export const etichettaQuantita = (asset) => (asset?.quotazione === 'percentuale' ? 'Valore nominale (€)' : 'Quantità')
export const etichettaPrezzo = (asset) => (asset?.quotazione === 'percentuale' ? 'Prezzo (% del nominale)' : 'Prezzo unitario (€)')

export const mostraQuantita = (asset, q) =>
  asset?.quotazione === 'percentuale' ? `nominale ${euro(q)}` : numero(q)

export const mostraPrezzo = (asset, p) =>
  asset?.quotazione === 'percentuale' ? `${numero(p)}%` : euro(p)
