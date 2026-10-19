import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { percorso } from '../../lib/categorie'
import { euro } from '../../lib/numeri'
import { dataBreve, frequenze } from '../../lib/date'

export default function Ricorrenze({ albero, nomePersona }) {
  const [ricorrenze, setRicorrenze] = useState([])
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('transazioni_ricorrenti')
      .select('*')
      .order('attiva', { ascending: false })
      .order('prossima_scadenza')
    if (error) return setErrore(messaggioErrore(error))
    setRicorrenze(data)
  }, [])

  useEffect(() => { carica() }, [carica])

  async function esegui(richiesta) {
    setErrore('')
    const { error } = await richiesta
    if (error) return setErrore(messaggioErrore(error))
    carica()
  }

  return (
    <div>
      <p className="nota">
        Le transazioni ricorrenti vengono create in automatico alla scadenza (dal passo 4).
        Disattivare o eliminare una ricorrenza non cancella le transazioni già create.
      </p>
      {errore && <p className="errore">{errore}</p>}
      {!ricorrenze.length && <p className="nota">Nessuna ricorrenza. Creane una con "Rendi ricorrente" in una nuova transazione.</p>}
      <div className="scheda elenco-movimenti">
        {ricorrenze.map((r) => (
          <div key={r.id} className={`movimento statico ${r.attiva ? '' : 'archiviata'}`}>
            <span className="movimento-testo">
              <strong>{r.nota || percorso(albero, r.macrocategoria_id, r.categoria_id)}</strong>
              <span className="nota">
                {frequenze[r.frequenza].etichetta} · prossima {dataBreve(r.prossima_scadenza)}
                {r.fine_ricorrenza && ` · fino al ${dataBreve(r.fine_ricorrenza)}`}
                {r.condivisa && <span className="etichetta">condivisa con {nomePersona(r.persona_id)}</span>}
                {!r.attiva && <span className="etichetta">non attiva</span>}
              </span>
              <span className="riga-azioni">
                <button className="piccolo" onClick={() => esegui(supabase.from('transazioni_ricorrenti').update({ attiva: !r.attiva }).eq('id', r.id))}>
                  {r.attiva ? 'Disattiva' : 'Riattiva'}
                </button>
                <button
                  className="piccolo pericolo"
                  onClick={() => window.confirm('Eliminare la ricorrenza? Le transazioni già create restano.') && esegui(supabase.from('transazioni_ricorrenti').delete().eq('id', r.id))}
                >
                  Elimina
                </button>
              </span>
            </span>
            <span className={`importo ${r.tipo}`}>{r.tipo === 'incasso' ? '+' : '−'}{euro(r.quota_personale)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
