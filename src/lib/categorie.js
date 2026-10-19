import { supabase } from '../supabase'

// Testo senza accenti e in minuscolo, per confronti "tolleranti".
export const normalizza = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Carica i tre livelli (tutti, anche archiviati: servono per mostrare i nomi
// delle transazioni vecchie) e prepara le mappe per id.
export async function caricaAlbero() {
  const [m, c, mi] = await Promise.all(
    ['macrocategorie', 'categorie', 'microcategorie'].map((t) => supabase.from(t).select('*').order('nome')),
  )
  const errore = m.error || c.error || mi.error
  if (errore) return { errore }
  const perId = (righe) => Object.fromEntries(righe.map((r) => [r.id, r]))
  return { macro: m.data, cat: c.data, micro: mi.data, mappa: { ...perId(m.data), ...perId(c.data), ...perId(mi.data) } }
}

// "Casa > Bollette > Energia elettrica" a partire dagli id.
export function percorso(albero, macroId, catId, microId) {
  return [macroId, catId, microId]
    .filter(Boolean)
    .map((id) => albero.mappa[id]?.nome ?? '?')
    .join(' > ')
}

// Tutti i percorsi attivi (macro, macro > cat, macro > cat > micro) per la ricerca.
export function percorsiAttivi(albero) {
  const elenco = []
  for (const m of albero.macro.filter((x) => x.attiva)) {
    elenco.push({ macroId: m.id, catId: null, microId: null, testo: m.nome })
    for (const c of albero.cat.filter((x) => x.attiva && x.macrocategoria_id === m.id)) {
      elenco.push({ macroId: m.id, catId: c.id, microId: null, testo: `${m.nome} > ${c.nome}` })
      for (const mi of albero.micro.filter((x) => x.attiva && x.categoria_id === c.id)) {
        elenco.push({ macroId: m.id, catId: c.id, microId: mi.id, testo: `${m.nome} > ${c.nome} > ${mi.nome}` })
      }
    }
  }
  return elenco.map((p) => ({ ...p, chiave: normalizza(p.testo) }))
}
