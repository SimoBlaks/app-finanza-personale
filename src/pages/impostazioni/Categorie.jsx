import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import RigaVoce from '../../components/RigaVoce'
import AggiungiVoce from '../../components/AggiungiVoce'

// Tabelle dei tre livelli e colonna che punta al livello superiore.
const livelli = {
  macro: { tabella: 'macrocategorie' },
  cat: { tabella: 'categorie', padre: 'macrocategoria_id' },
  micro: { tabella: 'microcategorie', padre: 'categoria_id' },
}

export default function Categorie() {
  const [dati, setDati] = useState({ macro: [], cat: [], micro: [] })
  const [aperte, setAperte] = useState({})
  const [archiviate, setArchiviate] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const [m, c, mi] = await Promise.all(
      ['macrocategorie', 'categorie', 'microcategorie'].map((t) => supabase.from(t).select('*').order('nome')),
    )
    const err = m.error || c.error || mi.error
    if (err) return setErrore(messaggioErrore(err))
    setDati({ macro: m.data, cat: c.data, micro: mi.data })
  }, [])

  useEffect(() => { carica() }, [carica])

  // Esegue una richiesta e ricarica; restituisce il messaggio d'errore (o '').
  async function esegui(richiesta) {
    const { error } = await richiesta
    if (error) return messaggioErrore(error)
    await carica()
    return ''
  }

  const aggiungi = (livello, nome, padreId) => {
    const { tabella, padre } = livelli[livello]
    return esegui(supabase.from(tabella).insert(padre ? { nome, [padre]: padreId } : { nome }))
  }

  const azioni = (livello, voce) => {
    const { tabella } = livelli[livello]
    return {
      onRinomina: (nome) => esegui(supabase.from(tabella).update({ nome }).eq('id', voce.id)),
      onArchivia: () => esegui(supabase.from(tabella).update({ attiva: !voce.attiva }).eq('id', voce.id)),
      onElimina: () => esegui(supabase.from(tabella).delete().eq('id', voce.id)),
    }
  }

  const visibili = (elenco) => (archiviate ? elenco : elenco.filter((v) => v.attiva))
  const commuta = (id) => setAperte((a) => ({ ...a, [id]: !a[id] }))
  const freccia = (id) => (
    <button className="espandi" onClick={() => commuta(id)} aria-label={aperte[id] ? 'Comprimi' : 'Espandi'}>
      {aperte[id] ? '▾' : '▸'}
    </button>
  )

  return (
    <div className="scheda">
      <div className="intestazione-scheda">
        <h2>Gerarchia categorie</h2>
        <label className="interruttore">
          <input type="checkbox" checked={archiviate} onChange={(e) => setArchiviate(e.target.checked)} />
          Mostra archiviate
        </label>
      </div>
      <p className="nota">Macrocategoria → categoria → microcategoria. Una voce già usata non si può eliminare: archiviala.</p>
      {errore && <p className="errore">{errore}</p>}

      <div className="albero">
        {visibili(dati.macro).map((m) => (
          <RigaVoce
            key={m.id}
            nome={m.nome}
            attiva={m.attiva}
            {...azioni('macro', m)}
            prima={freccia(m.id)}
            dopo={aperte[m.id] && (
              <div className="figli">
                {visibili(dati.cat.filter((c) => c.macrocategoria_id === m.id)).map((c) => (
                  <RigaVoce
                    key={c.id}
                    nome={c.nome}
                    attiva={c.attiva}
                    {...azioni('cat', c)}
                    prima={freccia(c.id)}
                    dopo={aperte[c.id] && (
                      <div className="figli">
                        {visibili(dati.micro.filter((mi) => mi.categoria_id === c.id)).map((mi) => (
                          <RigaVoce key={mi.id} nome={mi.nome} attiva={mi.attiva} {...azioni('micro', mi)} />
                        ))}
                        <AggiungiVoce segnaposto={`Nuova microcategoria in ${c.nome}`} onAggiungi={(n) => aggiungi('micro', n, c.id)} />
                      </div>
                    )}
                  />
                ))}
                <AggiungiVoce segnaposto={`Nuova categoria in ${m.nome}`} onAggiungi={(n) => aggiungi('cat', n, m.id)} />
              </div>
            )}
          />
        ))}
      </div>
      <AggiungiVoce segnaposto="Nuova macrocategoria" onAggiungi={(n) => aggiungi('macro', n)} />
    </div>
  )
}
