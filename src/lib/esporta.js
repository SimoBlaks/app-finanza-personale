import { supabase } from '../supabase'
import { caricaAlbero } from './categorie'
import { oggiISO } from './numeri'

// Export in Excel nello stesso formato del file usato per l'importazione:
// un foglio per anno (Data, Uscita, Entrata, Descrizione, Macrocategoria,
// Categoria, Microcategoria, Note) con riepilogo per macrocategoria a destra,
// più i fogli DATI (categorie), Rimborsi e Investimenti.

const FORMATO_EURO = '#,##0.00 "€";-#,##0.00 "€"'
const FORMATO_DATA = 'dd/mm/yyyy'
const euro2 = (n) => Math.round(Number(n) * 100) / 100
const comeData = (iso) => {
  const [a, m, g] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, g)) // exceljs converte le date in UTC
}
const virgola = (n) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Legge tutte le righe di una tabella a pagine da 1000 (limite delle API).
async function leggiTutto(costruisci) {
  const righe = []
  for (let da = 0; ; da += 1000) {
    const { data, error } = await costruisci().range(da, da + 999)
    if (error) throw error
    righe.push(...data)
    if (data.length < 1000) return righe
  }
}

function intestazione(foglio, titoli, larghezze) {
  foglio.columns = titoli.map((t, i) => ({ header: t, width: larghezze[i] }))
  const riga = foglio.getRow(1)
  riga.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  riga.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  riga.alignment = { vertical: 'middle' }
  riga.height = 20
  foglio.views = [{ state: 'frozen', ySplit: 1 }]
}

export async function esportaExcel({ annoDa, annoA, avanzamento = () => {} }) {
  const { wb, riepilogo } = await creaFileExcel({ annoDa, annoA, avanzamento })
  avanzamento('Scarico il file…')
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const nomeFile = `${oggiISO().replaceAll('-', '.')} - Entrate_Uscite.xlsx`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = nomeFile
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 10000)
  return { nomeFile, ...riepilogo }
}

// Costruisce la cartella di lavoro (senza scaricarla).
export async function creaFileExcel({ annoDa, annoA, avanzamento = () => {} }) {
  avanzamento('Carico le librerie…')
  const { default: ExcelJS } = await import('exceljs')

  avanzamento('Leggo i dati…')
  const da = `${annoDa}-01-01`
  const a = `${annoA}-12-31`
  const [albero, persone, asset, transazioni, rimborsi, operazioni, proventi, rettifiche] = await Promise.all([
    caricaAlbero(),
    supabase.from('persone').select('id, nome'),
    supabase.from('asset').select('id, nome, ticker_isin, quotazione'),
    leggiTutto(() => supabase.from('transazioni').select('*').gte('data', da).lte('data', a).order('data').order('created_at').order('id')),
    leggiTutto(() => supabase.from('pagamenti_saldo').select('*').gte('data', da).lte('data', a).order('data').order('created_at').order('id')),
    leggiTutto(() => supabase.from('operazioni_investimento').select('*').gte('data', da).lte('data', a).order('data').order('created_at').order('id')),
    leggiTutto(() => supabase.from('proventi_investimento').select('*').gte('data', da).lte('data', a).order('data').order('created_at').order('id')),
    leggiTutto(() => supabase.from('rettifiche_liquidita').select('*').gte('data', da).lte('data', a).order('data').order('created_at').order('id')),
  ])
  if (albero.errore) throw albero.errore
  if (persone.error) throw persone.error
  if (asset.error) throw asset.error

  const nome = (id) => (id ? albero.mappa[id]?.nome ?? '' : '')
  const nomePersona = Object.fromEntries(persone.data.map((p) => [p.id, p.nome]))
  const perAsset = Object.fromEntries(asset.data.map((x) => [x.id, x]))

  avanzamento('Preparo il file…')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finanza personale'
  wb.created = new Date()
  wb.calcProperties.fullCalcOnLoad = true

  // un foglio per anno
  const perAnno = new Map()
  for (const t of transazioni) {
    const anno = t.data.slice(0, 4)
    if (!perAnno.has(anno)) perAnno.set(anno, [])
    perAnno.get(anno).push(t)
  }
  for (const [anno, righe] of [...perAnno.entries()].sort()) {
    const f = wb.addWorksheet(anno)
    intestazione(f, ['Data', 'Uscita', 'Entrata', 'Descrizione', 'Macrocategoria', 'Categoria', 'Microcategoria', 'Note', '', 'RIEPILOGO ' + anno, 'Entrate', 'Uscite'],
      [12, 12, 12, 46, 20, 22, 24, 40, 3, 24, 13, 13])
    // le intestazioni del riepilogo non sono colorate come quelle della tabella
    for (const c of [9, 10, 11, 12]) {
      const cella = f.getRow(1).getCell(c)
      cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 9 ? 'FFFFFFFF' : 'FFE6F4F1' } }
      cella.font = { bold: true, color: { argb: 'FF0F766E' } }
    }

    for (const t of righe) {
      const note = []
      if (t.condivisa) {
        note.push(`condivisa con ${nomePersona[t.persona_id] ?? '?'}, pagata da ${t.pagata_da === 'io' ? 'me' : nomePersona[t.persona_id] ?? '?'}, totale ${virgola(t.importo_totale)} € (mia quota ${virgola(t.percentuale_mia)}%)`)
      }
      if (t.ricorrenza_id) note.push('ricorrente')
      const quota = euro2(t.quota_personale)
      const riga = f.addRow([
        comeData(t.data),
        t.tipo === 'spesa' ? quota : null,
        t.tipo === 'incasso' ? quota : null,
        t.nota ?? '',
        nome(t.macrocategoria_id),
        nome(t.categoria_id),
        nome(t.microcategoria_id),
        note.join(' · '),
      ])
      riga.getCell(1).numFmt = FORMATO_DATA
      riga.getCell(2).numFmt = FORMATO_EURO
      riga.getCell(3).numFmt = FORMATO_EURO
    }

    // riepilogo per macrocategoria con formule (si aggiorna se si modificano le righe)
    const ultima = righe.length + 1
    const totali = new Map()
    for (const t of righe) {
      const m = nome(t.macrocategoria_id)
      const v = totali.get(m) ?? { e: 0, u: 0 }
      if (t.tipo === 'incasso') v.e += Number(t.quota_personale)
      else v.u += Number(t.quota_personale)
      totali.set(m, v)
    }
    const macro = [...totali.keys()].sort((x, y) => x.localeCompare(y, 'it'))
    macro.forEach((m, i) => {
      const r = i + 2
      const v = totali.get(m)
      f.getCell(`J${r}`).value = m
      f.getCell(`K${r}`).value = { formula: `SUMIFS($C$2:$C$${ultima},$E$2:$E$${ultima},J${r})`, result: euro2(v.e) }
      f.getCell(`L${r}`).value = { formula: `SUMIFS($B$2:$B$${ultima},$E$2:$E$${ultima},J${r})`, result: euro2(v.u) }
      f.getCell(`K${r}`).numFmt = FORMATO_EURO
      f.getCell(`L${r}`).numFmt = FORMATO_EURO
    })
    const rt = macro.length + 2
    const tot = [...totali.values()].reduce((s, v) => ({ e: s.e + v.e, u: s.u + v.u }), { e: 0, u: 0 })
    f.getCell(`J${rt}`).value = 'Totale'
    f.getCell(`K${rt}`).value = { formula: `SUM(K2:K${rt - 1})`, result: euro2(tot.e) }
    f.getCell(`L${rt}`).value = { formula: `SUM(L2:L${rt - 1})`, result: euro2(tot.u) }
    f.getCell(`J${rt + 1}`).value = 'Risparmio'
    f.getCell(`K${rt + 1}`).value = { formula: `K${rt}-L${rt}`, result: euro2(tot.e - tot.u) }
    for (const c of ['J', 'K', 'L']) f.getCell(`${c}${rt}`).font = { bold: true }
    for (const c of ['J', 'K']) f.getCell(`${c}${rt + 1}`).font = { bold: true }
    for (const r of [rt, rt + 1]) for (const c of ['K', 'L']) f.getCell(`${c}${r}`).numFmt = FORMATO_EURO
    f.autoFilter = { from: 'A1', to: `H${ultima}` }
  }

  // DATI: gerarchia delle categorie
  const dati = wb.addWorksheet('DATI')
  intestazione(dati, ['Macrocategoria', 'Categoria', 'Microcategoria', 'Attiva'], [24, 26, 28, 10])
  for (const m of albero.macro) {
    const categorie = albero.cat.filter((c) => c.macrocategoria_id === m.id)
    if (!categorie.length) dati.addRow([m.nome, '', '', m.attiva ? 'sì' : 'no'])
    for (const c of categorie) {
      const micro = albero.micro.filter((x) => x.categoria_id === c.id)
      if (!micro.length) dati.addRow([m.nome, c.nome, '', m.attiva && c.attiva ? 'sì' : 'no'])
      for (const x of micro) dati.addRow([m.nome, c.nome, x.nome, m.attiva && c.attiva && x.attiva ? 'sì' : 'no'])
    }
  }

  // Rimborsi con le persone
  const fr = wb.addWorksheet('Rimborsi')
  intestazione(fr, ['Data', 'Persona', 'Direzione', 'Importo', 'Nota'], [12, 20, 12, 13, 40])
  for (const r of rimborsi) {
    const riga = fr.addRow([comeData(r.data), nomePersona[r.persona_id] ?? '?', r.direzione === 'ricevuto' ? 'Ricevuto' : 'Pagato', euro2(r.importo), r.nota ?? ''])
    riga.getCell(1).numFmt = FORMATO_DATA
    riga.getCell(4).numFmt = FORMATO_EURO
  }

  // Investimenti: acquisti, vendite, dividendi e cedole (in ordine di data)
  const fi = wb.addWorksheet('Investimenti')
  intestazione(fi, ['Data', 'Tipo', 'Asset', 'Ticker / ISIN', 'Quantità', 'Prezzo', 'Spese', 'Plusvalore', 'Tasse', 'Liquidità incassata', 'Provento lordo', 'Movimenta la liquidità'],
    [12, 11, 28, 16, 13, 13, 11, 13, 11, 18, 15, 12])
  const righeInvestimenti = [
    ...operazioni.map((o) => ({ ...o, genere: 'operazione' })),
    ...proventi.map((o) => ({ ...o, genere: 'provento' })),
  ].sort((x, y) => x.data.localeCompare(y.data) || x.created_at.localeCompare(y.created_at))
  for (const o of righeInvestimenti) {
    const x = perAsset[o.asset_id]
    if (o.genere === 'provento') {
      const riga = fi.addRow([
        comeData(o.data), o.tipo === 'cedola' ? 'Cedola' : 'Dividendo', x?.nome ?? '?', x?.ticker_isin ?? '',
        null, null, null, null, euro2(o.tasse), euro2(o.importo_netto), euro2(o.importo_lordo), 'sì',
      ])
      riga.getCell(1).numFmt = FORMATO_DATA
      for (const c of [9, 10, 11]) riga.getCell(c).numFmt = FORMATO_EURO
      continue
    }
    const riga = fi.addRow([
      comeData(o.data), o.tipo === 'acquisto' ? 'Acquisto' : 'Vendita', x?.nome ?? '?', x?.ticker_isin ?? '',
      Number(o.quantita), Number(o.prezzo), euro2(o.spese),
      o.plusvalore === null ? null : euro2(o.plusvalore), o.tasse === null ? null : euro2(o.tasse),
      o.liquidita_incassata === null ? null : euro2(o.liquidita_incassata),
      null, o.movimenta_liquidita === false ? 'no' : 'sì',
    ])
    riga.getCell(1).numFmt = FORMATO_DATA
    riga.getCell(5).numFmt = '#,##0.######'
    riga.getCell(6).numFmt = x?.quotazione === 'percentuale' ? '0.00####"%"' : '#,##0.00#### "€"'
    for (const c of [7, 8, 9, 10]) riga.getCell(c).numFmt = FORMATO_EURO
  }

  // Rettifiche di liquidità (allineamenti al saldo reale dei conti)
  if (rettifiche.length) {
    const ft = wb.addWorksheet('Rettifiche')
    intestazione(ft, ['Data', 'Importo', 'Nota'], [12, 13, 40])
    for (const r of rettifiche) {
      const riga = ft.addRow([comeData(r.data), euro2(r.importo), r.nota ?? ''])
      riga.getCell(1).numFmt = FORMATO_DATA
      riga.getCell(2).numFmt = FORMATO_EURO
    }
  }

  return { wb, riepilogo: { transazioni: transazioni.length, anni: perAnno.size, rimborsi: rimborsi.length, operazioni: operazioni.length + proventi.length } }
}
