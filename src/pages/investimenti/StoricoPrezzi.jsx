import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { dataBreve } from '../../lib/date'
import { mostraPrezzo } from '../../lib/investimenti'
import { useConferma } from '../../components/Conferma'

// Elenco dei prezzi salvati per un asset, con eliminazione dei prezzi sbagliati.
// Per correggere un prezzo basta reinserirlo con la stessa data in "Aggiorna Prezzi".
export default function StoricoPrezzi({ asset, onFine }) {
  const [prezzi, setPrezzi] = useState(null)
  const [errore, setErrore] = useState('')
  const conferma = useConferma()

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('prezzi_storici')
      .select('*')
      .eq('asset_id', asset.id)
      .order('data', { ascending: false })
    if (error) return setErrore(messaggioErrore(error))
    setPrezzi(data)
  }, [asset.id])

  useEffect(() => { carica() }, [carica])

  async function elimina(p) {
    const ok = await conferma({
      titolo: 'Eliminare questo prezzo?',
      messaggio: `${mostraPrezzo(asset, p.prezzo_chiusura)} del ${dataBreve(p.data)}`,
      conferma: 'Elimina',
      pericolo: true,
    })
    if (!ok) return
    setErrore('')
    const { error } = await supabase.from('prezzi_storici').delete().eq('id', p.id)
    if (error) return setErrore(messaggioErrore(error))
    carica()
  }

  return (
    <div className="scheda modulo">
      <h2>Storico prezzi · {asset.nome}</h2>
      <p className="nota">Per correggere un prezzo, reinseriscilo con la stessa data da "Aggiorna Prezzi": sostituisce quello vecchio.</p>
      {errore && <p className="errore">{errore}</p>}
      {prezzi === null && <p className="caricamento">Caricamento…</p>}
      {prezzi?.length === 0 && <p className="nota">Nessun prezzo salvato.</p>}
      {prezzi?.length > 0 && (
        <div className="elenco-movimenti">
          {prezzi.map((p) => (
            <div key={p.id} className="movimento statico">
              <span className="movimento-testo">
                <strong>{mostraPrezzo(asset, p.prezzo_chiusura)}</strong>
                <span className="nota">{dataBreve(p.data)} · {p.fonte}</span>
              </span>
              <button className="piccolo pericolo" onClick={() => elimina(p)}>Elimina</button>
            </div>
          ))}
        </div>
      )}
      <div className="azioni-modulo">
        <button type="button" className="primario" onClick={onFine}>Fatto</button>
      </div>
    </div>
  )
}
