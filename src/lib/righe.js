// Il database restituisce al massimo 1000 righe per richiesta e taglia le altre senza avvisare.
// Per le letture che possono crescere oltre (vedi DECISIONI.md) si legge a pagine da 1000.
// costruisci: funzione che crea la richiesta, con un ordine stabile (es. .order('id')).
export async function tutteLeRighe(costruisci) {
  const righe = []
  for (let da = 0; ; da += 1000) {
    const { data, error } = await costruisci().range(da, da + 999)
    if (error) return { data: null, error }
    righe.push(...data)
    if (data.length < 1000) return { data: righe, error: null }
  }
}
