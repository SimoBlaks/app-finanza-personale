import { fattore } from './investimenti'

// Patrimonio a fine mese (vedi DECISIONI.md): liquidità + investimenti + saldi con le persone.
// - liquidità: quella del grafico mese per mese (saldo iniziale + movimenti cumulati);
// - investimenti: quantità posseduta a fine mese × ultimo prezzo inserito fino a quella data,
//   oppure il PMC se per l'asset non c'è ancora un prezzo; gli asset esclusi dal patrimonio non contano;
// - persone: crediti meno debiti a quella data (stesse regole della vista saldi_persone).
// Il mese in corso si chiude a oggi, così l'ultimo punto coincide con il patrimonio attuale.
//
// liquidita: [{ id: 'AAAA-MM', etichetta, valore }] in ordine di tempo.
export function patrimonioMensile({ liquidita, asset, operazioni, prezzi, condivise, rimborsi, oggi }) {
  const perId = Object.fromEntries(asset.map((a) => [a.id, a]))
  // stesso ordine del database: per data, a parità di data prima gli acquisti
  const ops = [...operazioni].sort(
    (x, y) => x.data.localeCompare(y.data) || (x.tipo === 'vendita') - (y.tipo === 'vendita') || x.created_at.localeCompare(y.created_at),
  )
  const listini = [...prezzi].sort((x, y) => x.data.localeCompare(y.data))
  const movimentiPersone = [
    ...condivise.map((t) => ({
      data: t.data,
      importo: t.pagata_da === 'io' ? Number(t.importo_totale) - Number(t.quota_personale) : -Number(t.quota_personale),
    })),
    ...rimborsi.map((r) => ({ data: r.data, importo: r.direzione === 'ricevuto' ? -Number(r.importo) : Number(r.importo) })),
  ].sort((x, y) => x.data.localeCompare(y.data))

  const posizioni = {} // asset_id → { quantita, costo }
  const ultimoPrezzo = {} // asset_id → prezzo
  let iOp = 0
  let iPrezzo = 0
  let iPersone = 0
  let saldoPersone = 0

  return liquidita.map((m) => {
    const [a, mm] = m.id.split('-').map(Number)
    const fineMese = `${m.id}-${String(new Date(Date.UTC(a, mm, 0)).getUTCDate()).padStart(2, '0')}`
    const fine = fineMese < oggi ? fineMese : oggi

    for (; iOp < ops.length && ops[iOp].data <= fine; iOp++) {
      const o = ops[iOp]
      const f = fattore(perId[o.asset_id])
      const p = (posizioni[o.asset_id] ??= { quantita: 0, costo: 0 })
      const q = Number(o.quantita)
      if (o.tipo === 'acquisto') {
        p.quantita += q
        p.costo += q * Number(o.prezzo) * f + Number(o.spese)
      } else {
        p.costo -= p.quantita > 0 ? (p.costo / p.quantita) * q : 0
        p.quantita -= q
      }
    }
    for (; iPrezzo < listini.length && listini[iPrezzo].data <= fine; iPrezzo++) {
      ultimoPrezzo[listini[iPrezzo].asset_id] = Number(listini[iPrezzo].prezzo_chiusura)
    }
    for (; iPersone < movimentiPersone.length && movimentiPersone[iPersone].data <= fine; iPersone++) {
      saldoPersone += movimentiPersone[iPersone].importo
    }

    let investimenti = 0
    for (const [id, p] of Object.entries(posizioni)) {
      const as = perId[id]
      if (p.quantita <= 0 || as?.escluso_dal_patrimonio) continue
      const f = fattore(as)
      const prezzo = ultimoPrezzo[id] ?? p.costo / p.quantita / f
      investimenti += p.quantita * prezzo * f
    }

    return {
      id: m.id,
      etichetta: m.etichetta,
      valore: m.valore + investimenti + saldoPersone,
      parti: { liquidita: m.valore, investimenti, persone: saldoPersone },
    }
  })
}

// Liquidità a fine mese, dal mese del saldo iniziale a oggi: saldo iniziale + movimenti cumulati
// (vista riepilogo_mensile). Restituisce [{ id: 'AAAA-MM', valore }].
export function liquiditaMensile(liquidita, mensile, meseOggi) {
  const perMese = new Map(mensile.map((m) => [m.mese.slice(0, 7), Number(m.movimento_liquidita ?? 0)]))
  const inizio = liquidita?.data_saldo_iniziale?.slice(0, 7) ?? mensile[0]?.mese.slice(0, 7) ?? meseOggi
  const risultato = []
  let cumulato = Number(liquidita?.saldo_iniziale ?? 0)
  for (let am = inizio; am <= meseOggi; ) {
    cumulato += perMese.get(am) ?? 0
    risultato.push({ id: am, valore: cumulato })
    const [a, m] = am.split('-').map(Number)
    am = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
  }
  return risultato
}
