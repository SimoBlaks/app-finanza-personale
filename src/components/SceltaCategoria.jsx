import { useMemo, useState } from 'react'
import { normalizza, percorsiAttivi, percorso } from '../lib/categorie'

// Campo categoria con autocompletamento (SPEC 4.3 e 4.4).
// valore: { macroId, catId, microId }; onChange riceve lo stesso oggetto.
export default function SceltaCategoria({ albero, valore, onChange }) {
  const [testo, setTesto] = useState('')
  const [espanse, setEspanse] = useState({})
  const percorsi = useMemo(() => percorsiAttivi(albero), [albero])

  const { macroId, catId, microId } = valore

  // Selezione già fatta: mostro il percorso e, se servono, i livelli figli da scegliere.
  if (macroId) {
    const categorie = albero.cat.filter((c) => c.attiva && c.macrocategoria_id === macroId)
    const micro = catId ? albero.micro.filter((m) => m.attiva && m.categoria_id === catId) : []
    return (
      <div className="scelta-categoria">
        <div className="categoria-scelta">
          <span>{percorso(albero, macroId, catId, microId)}</span>
          <button type="button" className="piccolo" onClick={() => { setTesto(''); onChange({}) }}>Cambia</button>
        </div>
        {!catId && (
          <>
            <p className="nota">Scegli la categoria:</p>
            <div className="pulsanti-scelta">
              {categorie.map((c) => (
                <button type="button" key={c.id} className="piccolo" onClick={() => onChange({ macroId, catId: c.id })}>{c.nome}</button>
              ))}
              {!categorie.length && <span className="errore">Questa macrocategoria non ha categorie attive.</span>}
            </div>
          </>
        )}
        {catId && micro.length > 0 && (
          <>
            <p className="nota">Microcategoria (facoltativa):</p>
            <div className="pulsanti-scelta">
              {micro.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`piccolo ${m.id === microId ? 'selezionato' : ''}`}
                  onClick={() => onChange({ macroId, catId, microId: m.id === microId ? null : m.id })}
                >
                  {m.nome}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  const cerca = normalizza(testo.trim())
  const risultati = cerca ? percorsi.filter((p) => p.chiave.includes(cerca)).slice(0, 40) : []

  return (
    <div className="scelta-categoria">
      <input
        placeholder="Cerca una categoria (es. energia, casa)…"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
      />
      <div className="elenco-categorie">
        {cerca ? (
          risultati.length ? (
            risultati.map((p) => (
              <button type="button" key={`${p.macroId}${p.catId}${p.microId}`} className="voce-categoria" onClick={() => onChange(p)}>
                {p.testo}
              </button>
            ))
          ) : (
            <p className="nota">Nessuna categoria trovata. Puoi crearla in Impostazioni.</p>
          )
        ) : (
          albero.macro.filter((m) => m.attiva).map((m) => (
            <div key={m.id}>
              <div className="voce-categoria-riga">
                <button type="button" className="espandi" onClick={() => setEspanse((x) => ({ ...x, [m.id]: !x[m.id] }))}>
                  {espanse[m.id] ? '▾' : '▸'}
                </button>
                <button type="button" className="voce-categoria" onClick={() => onChange({ macroId: m.id })}>{m.nome}</button>
              </div>
              {espanse[m.id] && (
                <div className="figli">
                  {albero.cat.filter((c) => c.attiva && c.macrocategoria_id === m.id).map((c) => (
                    <button type="button" key={c.id} className="voce-categoria" onClick={() => onChange({ macroId: m.id, catId: c.id })}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
