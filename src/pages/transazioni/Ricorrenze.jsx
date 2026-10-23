import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { useConferma } from '../../components/Conferma'
import { percorso } from '../../lib/categorie'
import { euro, oggiISO } from '../../lib/numeri'
import { dataBreve, frequenze, prossimaDaOggi } from '../../lib/date'
import ModuloRicorrenza from './ModuloRicorrenza'

const dataOra = (ts) =>
  new Date(ts).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function Ricorrenze({ albero, persone, nomePersona }) {
  const [ricorrenze, setRicorrenze] = useState([])
  const [ultimaEsecuzione, setUltimaEsecuzione] = useState(null)
  const [errore, setErrore] = useState('')
  const [inModifica, setInModifica] = useState(null)
  const conferma = useConferma()

  const carica = useCallback(async () => {
    const [r, j] = await Promise.all([
      supabase.from('transazioni_ricorrenti').select('*').order('attiva', { ascending: false }).order('prossima_scadenza'),
      supabase.from('esecuzioni_job').select('*').eq('job', 'ricorrenze').order('eseguito_il', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (r.error || j.error) return setErrore(messaggioErrore(r.error || j.error))
    setRicorrenze(r.data)
    setUltimaEsecuzione(j.data)
  }, [])

  useEffect(() => { carica() }, [carica])

  async function esegui(richiesta) {
    setErrore('')
    const { error } = await richiesta
    if (error) return setErrore(messaggioErrore(error))
    carica()
  }

  // Riattivando una ricorrenza ferma, le scadenze saltate non vengono recuperate:
  // si riparte dalla prima scadenza da oggi in poi (come per i piani di accumulo).
  function cambiaAttiva(r) {
    const dati = { attiva: !r.attiva }
    if (!r.attiva && r.prossima_scadenza < oggiISO())
      dati.prossima_scadenza = prossimaDaOggi(r.prossima_scadenza, r.frequenza, r.giorno_riferimento, oggiISO())
    esegui(supabase.from('transazioni_ricorrenti').update(dati).eq('id', r.id))
  }

  if (inModifica)
    return <ModuloRicorrenza ricorrenza={inModifica} albero={albero} persone={persone} onFine={() => { setInModifica(null); carica() }} />

  return (
    <div>
      <p className="nota">
        Le transazioni ricorrenti vengono create in automatico ogni mattina, con la data della scadenza.
        Disattivare, modificare o eliminare una ricorrenza non cambia le transazioni già create; riattivandola si riparte dalla prima scadenza da oggi in poi.
      </p>
      <p className={`stato-job ${ultimaEsecuzione?.esito === 'errore' ? 'errore' : ''}`}>
        {!ultimaEsecuzione
          ? 'Il job automatico non è ancora stato eseguito.'
          : ultimaEsecuzione.esito === 'ok'
            ? `Ultima esecuzione: ${dataOra(ultimaEsecuzione.eseguito_il)} · ${ultimaEsecuzione.transazioni_create} transazioni create${ultimaEsecuzione.operazioni_create ? ` · ${ultimaEsecuzione.operazioni_create} acquisti dei piani di accumulo` : ''}`
            : `Ultima esecuzione: ${dataOra(ultimaEsecuzione.eseguito_il)} · errore: ${ultimaEsecuzione.messaggio}`}
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
                <button className="piccolo" onClick={() => setInModifica(r)}>Modifica</button>
                <button className="piccolo" onClick={() => cambiaAttiva(r)}>
                  {r.attiva ? 'Disattiva' : 'Riattiva'}
                </button>
                <button
                  className="piccolo pericolo"
                  onClick={async () =>
                    (await conferma({ titolo: 'Eliminare la ricorrenza?', messaggio: 'Le transazioni già create restano.', conferma: 'Elimina', pericolo: true })) &&
                    esegui(supabase.from('transazioni_ricorrenti').delete().eq('id', r.id))}
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
