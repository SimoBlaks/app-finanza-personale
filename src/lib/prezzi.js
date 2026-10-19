import { supabase } from '../supabase'
import { oggiISO } from './numeri'
import { fattore } from './investimenti'

export const impostazioniPredefinite = {
  giorni_prezzo_vecchio_azioni: 7,
  giorni_prezzo_vecchio_obbligazioni: 30,
  soglia_avviso_prezzo_pct: 20,
}

export async function caricaImpostazioni() {
  const { data, error } = await supabase.from('impostazioni').select('*').maybeSingle()
  return { impostazioni: { ...impostazioniPredefinite, ...(data ?? {}) }, error }
}

// Per ogni asset il prezzo più recente con data ≤ oggi (SPEC 6.2).
export async function caricaUltimiPrezzi() {
  const { data, error } = await supabase
    .from('prezzi_storici')
    .select('asset_id, data, prezzo_chiusura, fonte')
    .lte('data', oggiISO())
    .order('data', { ascending: false })
  if (error) return { error }
  const ultimi = {}
  for (const p of data) if (!ultimi[p.asset_id]) ultimi[p.asset_id] = p
  return { ultimi }
}

const giorniDa = (iso) => Math.floor((new Date(`${oggiISO()}T12:00:00`) - new Date(`${iso}T12:00:00`)) / 86400000)

// Valutazione di una posizione. Senza prezzo si usa provvisoriamente il PMC.
export function valuta(asset, posizione, ultimo, impostazioni) {
  const quantita = Number(posizione.quantita)
  const pmc = Number(posizione.pmc)
  const costo = Number(posizione.costo_carico)
  const prezzo = ultimo ? Number(ultimo.prezzo_chiusura) : pmc
  const valore = quantita * prezzo * fattore(asset)
  const guadagno = valore - costo
  const soglia =
    asset?.tipologia === 'obbligazione'
      ? impostazioni.giorni_prezzo_vecchio_obbligazioni
      : impostazioni.giorni_prezzo_vecchio_azioni
  return {
    prezzo,
    dataPrezzo: ultimo?.data ?? null,
    senzaPrezzo: !ultimo,
    prezzoVecchio: !!ultimo && giorniDa(ultimo.data) > soglia,
    valore,
    guadagno,
    guadagnoPct: costo > 0 ? (guadagno / costo) * 100 : 0,
  }
}
