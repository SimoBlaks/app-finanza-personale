import { euro, numero } from './numeri'

// Tipologie di asset: al singolare per le schede, al plurale per il grafico della dashboard.
export const tipologie = { azione: 'Azione', etf: 'ETF', obbligazione: 'Obbligazione', fondo: 'Fondo' }
export const tipologiePlurale = { azione: 'Azioni', etf: 'ETF', obbligazione: 'Obbligazioni', fondo: 'Fondi' }

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

const giorniTra = (da, a) => (new Date(`${a}T12:00:00`) - new Date(`${da}T12:00:00`)) / 86400000

// TIR (tasso interno di rendimento annuo) di flussi datati [{ data, importo }]: uscite negative,
// entrate positive. Cerca per bisezione il tasso che azzera il valore attuale; null se non esiste.
export function tir(flussi) {
  if (!flussi.length || !flussi.some((f) => f.importo < 0) || !flussi.some((f) => f.importo > 0)) return null
  const inizio = flussi.reduce((m, f) => (f.data < m ? f.data : m), flussi[0].data)
  if (flussi.every((f) => f.data === inizio)) return null
  const valore = (r) => flussi.reduce((t, f) => t + f.importo / (1 + r) ** (giorniTra(inizio, f.data) / 365), 0)
  let basso = -0.9999
  let alto = 10
  if (valore(basso) * valore(alto) > 0) return null
  for (let i = 0; i < 200; i++) {
    const medio = (basso + alto) / 2
    if (valore(basso) * valore(medio) <= 0) alto = medio
    else basso = medio
  }
  return (basso + alto) / 2
}

// Statistiche di un investimento concluso (tutte le quote vendute), da operazioni e proventi:
// investito = acquisti con spese; incassato = netto delle vendite (dopo spese e tasse).
// inflazione: cumulata nel periodo in % (facoltativa) → ROI e TIR reali.
export function statisticheConcluso(asset, operazioni, proventi, inflazione) {
  const ops = operazioni.filter((o) => o.asset_id === asset.id)
  const prov = proventi.filter((p) => p.asset_id === asset.id)
  const f = fattore(asset)
  let investito = 0
  let incassato = 0
  let spese = 0
  let tasse = 0
  const flussi = []
  for (const o of ops) {
    spese += Number(o.spese)
    if (o.tipo === 'acquisto') {
      const costo = Number(o.quantita) * Number(o.prezzo) * f + Number(o.spese)
      investito += costo
      flussi.push({ data: o.data, importo: -costo })
    } else {
      incassato += Number(o.liquidita_incassata)
      tasse += Number(o.tasse)
      flussi.push({ data: o.data, importo: Number(o.liquidita_incassata) })
    }
  }
  const proventiNetti = prov.reduce((t, p) => t + Number(p.importo_netto), 0)
  tasse += prov.reduce((t, p) => t + Number(p.tasse), 0)
  for (const p of prov) flussi.push({ data: p.data, importo: Number(p.importo_netto) })

  const date = [...ops, ...prov].map((x) => x.data).sort()
  const primoAcquisto = ops.filter((o) => o.tipo === 'acquisto').map((o) => o.data).sort()[0]
  const ultimaVendita = ops.filter((o) => o.tipo === 'vendita').map((o) => o.data).sort().at(-1)
  const guadagno = incassato + proventiNetti - investito
  const roi = investito > 0 ? guadagno / investito : null
  const tasso = tir(flussi)
  const anni = primoAcquisto && ultimaVendita ? giorniTra(primoAcquisto, ultimaVendita) / 365.25 : 0
  const inf = inflazione === null || inflazione === undefined || inflazione === '' ? null : Number(inflazione) / 100
  return {
    primoAcquisto,
    ultimaVendita,
    ultimaData: date.at(-1),
    anni,
    investito,
    incassato,
    proventiNetti,
    guadagno,
    spese,
    tasse,
    roi,
    tir: tasso,
    roiReale: inf !== null && roi !== null ? (1 + roi) / (1 + inf) - 1 : null,
    tirReale: inf !== null && tasso !== null && anni > 0 ? (1 + tasso) / (1 + inf) ** (1 / anni) - 1 : null,
  }
}

// "3 anni e 7 mesi" tra due date ISO.
export function durata(da, a) {
  const [a1, m1, g1] = da.split('-').map(Number)
  const [a2, m2, g2] = a.split('-').map(Number)
  let mesi = (a2 - a1) * 12 + (m2 - m1) - (g2 < g1 ? 1 : 0)
  if (mesi < 1) return `${Math.max(1, Math.round(giorniTra(da, a)))} giorni`
  const anni = Math.floor(mesi / 12)
  mesi %= 12
  const parti = [anni && `${anni} ${anni === 1 ? 'anno' : 'anni'}`, mesi && `${mesi} ${mesi === 1 ? 'mese' : 'mesi'}`].filter(Boolean)
  return parti.join(' e ')
}
