import { euro, numero } from './numeri'

// Le obbligazioni sono quotate in % del nominale: valore = quantità × prezzo / 100.
export const fattore = (asset) => (asset?.quotazione === 'percentuale' ? 0.01 : 1)

export const etichettaQuantita = (asset) => (asset?.quotazione === 'percentuale' ? 'Valore nominale (€)' : 'Quantità')
export const etichettaPrezzo = (asset) => (asset?.quotazione === 'percentuale' ? 'Prezzo (% del nominale)' : 'Prezzo unitario (€)')

export const mostraQuantita = (asset, q) =>
  asset?.quotazione === 'percentuale' ? `nominale ${euro(q)}` : numero(q)

// Quantità e PMC di un asset subito prima di una vendita in una certa data, con le stesse
// regole del database: operazioni in ordine di data (a parità di data prima gli acquisti),
// gli acquisti aggiungono quantità × prezzo + spese, una vendita toglie quantità × PMC.
// esclusa: la vendita che si sta modificando, che non conta su sé stessa.
export function posizioneAl(operazioni, asset, data, esclusa) {
  const ordinate = operazioni
    .filter((o) => o.asset_id === asset.id && o.id !== esclusa?.id && o.data <= data)
    .filter((o) => !(o.tipo === 'vendita' && o.data === data && esclusa && o.created_at > esclusa.created_at))
    .sort((x, y) => x.data.localeCompare(y.data) || (x.tipo === 'vendita') - (y.tipo === 'vendita') || x.created_at.localeCompare(y.created_at))
  let quantita = 0
  let costo = 0
  for (const o of ordinate) {
    const q = Number(o.quantita)
    if (o.tipo === 'acquisto') {
      quantita += q
      costo += q * Number(o.prezzo) * fattore(asset) + Number(o.spese)
    } else {
      const pmc = quantita > 0 ? costo / quantita / fattore(asset) : 0
      costo -= q * pmc * fattore(asset)
      quantita -= q
    }
  }
  return { quantita, pmc: quantita > 0 ? costo / quantita / fattore(asset) : 0 }
}

export const mostraPrezzo = (asset, p) =>
  asset?.quotazione === 'percentuale' ? `${numero(p)}%` : euro(p)
