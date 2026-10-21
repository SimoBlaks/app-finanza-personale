import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { normalizza, percorsiAttivi, percorso } from '../lib/categorie'

// Filtro con più categorie insieme, a qualsiasi livello (macro, categoria, micro).
// valore: [{ livello: 'macro' | 'cat' | 'micro', id }]. Una voce scelta comprende tutte le sue figlie.
// Si naviga un livello alla volta (comodo da telefono): la casella sceglie, la riga entra nel livello sotto.
export default function FiltroCategorie({ albero, valore, onChange }) {
  const [testo, setTesto] = useState('')
  const [dentro, setDentro] = useState([]) // [] → macro, [macroId] → categorie, [macroId, catId] → micro
  const percorsi = useMemo(() => percorsiAttivi(albero), [albero])
  const scelti = new Set(valore.map((v) => v.id))

  // [categoria, macro] per una micro, [macro] per una categoria
  const genitori = (livello, id) => {
    if (livello === 'micro') {
      const catId = albero.mappa[id]?.categoria_id
      return [catId, albero.mappa[catId]?.macrocategoria_id]
    }
    return livello === 'cat' ? [albero.mappa[id]?.macrocategoria_id] : []
  }
  const compresa = (livello, id) => genitori(livello, id).some((g) => scelti.has(g))
  // quante voci interne sono scelte (per segnare una scelta parziale)
  const interneScelte = (id) => valore.filter((v) => genitori(v.livello, v.id).includes(id)).length
  const nomePercorso = (livello, id) => {
    const [a, b] = genitori(livello, id)
    if (livello === 'micro') return percorso(albero, b, a, id)
    if (livello === 'cat') return percorso(albero, a, id)
    return percorso(albero, id)
  }

  // scegliendo una voce si tolgono le sue interne già scelte: sono comprese
  function cambia(livello, id) {
    if (scelti.has(id)) return onChange(valore.filter((v) => v.id !== id))
    onChange([...valore.filter((v) => !genitori(v.livello, v.id).includes(id)), { livello, id }])
  }

  const attive = (righe, campo, padre) => righe.filter((r) => r.attiva && r[campo] === padre)
  const [macroId, catId] = dentro
  const livello = catId ? 'micro' : macroId ? 'cat' : 'macro'
  const voci = catId
    ? attive(albero.micro, 'categoria_id', catId)
    : macroId ? attive(albero.cat, 'macrocategoria_id', macroId) : albero.macro.filter((m) => m.attiva)
  const figlie = (id) =>
    livello === 'macro' ? attive(albero.cat, 'macrocategoria_id', id).length
      : livello === 'cat' ? attive(albero.micro, 'categoria_id', id).length : 0

  const cerca = normalizza(testo.trim())
  const risultati = cerca ? percorsi.filter((p) => p.chiave.includes(cerca)).slice(0, 40) : []

  return (
    <div className="scelta-categoria">
      {valore.length > 0 && (
        <div className="categorie-scelte">
          {valore.map((v) => (
            <button type="button" key={v.id} className="piccolo selezionato" onClick={() => cambia(v.livello, v.id)} aria-label={`Togli ${nomePercorso(v.livello, v.id)}`}>
              {nomePercorso(v.livello, v.id)} ✕
            </button>
          ))}
        </div>
      )}
      <input placeholder="Cerca una categoria (es. energia, casa)…" value={testo} onChange={(e) => setTesto(e.target.value)} />

      <div className="elenco-filtro">
        {cerca ? (
          risultati.length ? (
            risultati.map((p) => {
              const [l, id] = p.microId ? ['micro', p.microId] : p.catId ? ['cat', p.catId] : ['macro', p.macroId]
              return (
                <RigaFiltro key={id} nome={p.testo} scelta={scelti.has(id)} compresa={compresa(l, id)} parziali={interneScelte(id)} onCambia={() => cambia(l, id)} />
              )
            })
          ) : (
            <p className="nota">Nessuna categoria trovata.</p>
          )
        ) : (
          <>
            {dentro.length > 0 && (
              <button type="button" className="torna-filtro" onClick={() => setDentro(dentro.slice(0, -1))}>
                ‹ {catId ? albero.mappa[macroId]?.nome : 'Tutte le macrocategorie'}
              </button>
            )}
            {dentro.length > 0 && (
              <RigaFiltro
                nome={`Tutta "${albero.mappa[catId ?? macroId]?.nome}"`}
                principale
                scelta={scelti.has(catId ?? macroId)}
                compresa={compresa(catId ? 'cat' : 'macro', catId ?? macroId)}
                parziali={interneScelte(catId ?? macroId)}
                onCambia={() => cambia(catId ? 'cat' : 'macro', catId ?? macroId)}
              />
            )}
            {voci.map((v) => (
              <RigaFiltro
                key={v.id}
                nome={v.nome}
                scelta={scelti.has(v.id)}
                compresa={compresa(livello, v.id)}
                parziali={interneScelte(v.id)}
                onCambia={() => cambia(livello, v.id)}
                onEntra={figlie(v.id) ? () => setDentro([...dentro, v.id]) : null}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// Una riga: casella a sinistra; se ci sono voci interne, la riga intera porta al livello sotto.
// Scelta parziale (solo alcune voci interne): casella con il trattino e "N scelte".
function RigaFiltro({ nome, scelta, compresa, parziali, principale, onCambia, onEntra }) {
  const casella = useRef(null)
  const id = useId()
  const parziale = !scelta && !compresa && parziali > 0
  useEffect(() => { if (casella.current) casella.current.indeterminate = parziale }, [parziale])
  const dettaglio = compresa ? 'compresa' : parziale ? `${parziali} ${parziali === 1 ? 'scelta' : 'scelte'} all'interno` : null

  return (
    <div className={`riga-filtro ${principale ? 'principale' : ''}`}>
      <span className="casella-filtro">
        <input id={id} ref={casella} type="checkbox" checked={scelta || compresa} disabled={compresa} onChange={onCambia} aria-label={nome} />
      </span>
      {onEntra ? (
        <button type="button" className="nome-filtro" onClick={onEntra}>
          <span>{nome}{dettaglio && <span className={`nota ${parziale ? 'parziale' : ''}`}>{dettaglio}</span>}</span>
          <span className="freccia" aria-hidden="true">›</span>
        </button>
      ) : (
        <label className="nome-filtro" htmlFor={id}>
          <span>{nome}{dettaglio && <span className={`nota ${parziale ? 'parziale' : ''}`}>{dettaglio}</span>}</span>
        </label>
      )}
    </div>
  )
}
